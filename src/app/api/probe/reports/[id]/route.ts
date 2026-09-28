import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { actorName, requireTool } from "@/lib/draft/guard";
import { isPreview } from "@/lib/draft/previewStores";
import { appendDraftItem, readDraft } from "@/lib/draft/store";
import { ReportStoreError, deleteReport, getReport, patchReport, reportStorePersistent, reportsOnBackend } from "@/lib/draft/reportStore";
import { checkText, cohortNote, reportAllText } from "@/lib/draft/report";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { fetchPapillonMonths } from "@/lib/draft/papillon";
import { buildSnapshot } from "@/lib/draft/snapshot";
import { seedStoreOps } from "@/lib/draft/seed";
import { templateMissing } from "@/lib/draft/reportTemplateData";
import type { Activity, BackendRestaurant, ReportProposal, StoreOps, StoreReport } from "@/lib/draft/types";

const storeError = (e: unknown) => NextResponse.json({ detail: e instanceof ReportStoreError ? e.message : "리포트 저장소 오류" }, { status: e instanceof ReportStoreError && e.status < 500 ? e.status : 502 });
const draft = () => !reportsOnBackend();

async function load(id: string): Promise<StoreReport | NextResponse> {
  try {
    const cur = await getReport(id);
    return cur ?? NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
  } catch (e) { return storeError(e); }
}
async function save(id: string, patch: Partial<StoreReport>): Promise<StoreReport | NextResponse> {
  try {
    const r = await patchReport(id, patch);
    return r ?? NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
  } catch (e) { return storeError(e); }
}

/** PATCH — 문구만 고친다. 스냅샷 숫자는 읽기 전용. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const cur = await load(id);
  if (cur instanceof NextResponse) return cur;
  if (cur.status === "LINKED" || cur.status === "SENT" || cur.status === "REVOKED") return NextResponse.json({ detail: "링크가 나간 리포트는 고칠 수 없습니다. 갱신본을 만드세요." }, { status: 409 });
  const b = (await req.json().catch(() => ({}))) as { title?: string; summary?: string; interpretation?: string[]; proposals?: Pick<ReportProposal, "rule" | "text" | "approved">[] };
  const who = (await actorName()) ?? "unknown";
  const now = new Date().toISOString();
  const patch: Partial<StoreReport> = { status: "DRAFT", approved_by: null, approved_at: null }; // 문구가 바뀌면 승인은 무효
  if (typeof b.title === "string") patch.title = b.title.trim().slice(0, 80);
  if (typeof b.summary === "string") patch.summary = b.summary.trim().slice(0, 300);
  if (Array.isArray(b.interpretation)) patch.interpretation = b.interpretation.map((s) => String(s).trim().slice(0, 300)).filter(Boolean).slice(0, 4);
  if (Array.isArray(b.proposals)) {
    patch.proposals = cur.proposals.map((p) => {
      const n = b.proposals!.find((x) => x.rule === p.rule);
      if (!n) return p;
      const text = typeof n.text === "string" ? n.text.trim().slice(0, 400) : p.text;
      const changed = text !== p.text;
      return { ...p, text, approved: Boolean(n.approved), edited_by: changed ? who : p.edited_by, edited_at: changed ? now : p.edited_at };
    });
  }
  const updated = await save(id, patch);
  if (updated instanceof NextResponse) return updated;
  return NextResponse.json({ report: updated, draft: draft() });
}

/**
 * DELETE — 초안·승인 단계 리포트를 지운다. 게시물은 다시 「리포트 없음」으로 돌아가 새로 만들 수 있다.
 * 링크가 나갔거나 보냈다고 표시한 리포트는 지우지 않는다 — 무엇을 언제 보냈는지가 남아야 한다(그건 회수).
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const cur = await load(id);
  if (cur instanceof NextResponse) return cur;
  if (cur.status !== "DRAFT" && cur.status !== "APPROVED") {
    return NextResponse.json({ detail: "링크가 나갔거나 보낸 리포트는 지울 수 없습니다. 회수만 됩니다." }, { status: 409 });
  }
  if (cur.token) return NextResponse.json({ detail: "링크가 발급된 리포트는 지울 수 없습니다." }, { status: 409 });
  try {
    await deleteReport(id);
  } catch (e) {
    return storeError(e);
  }
  const who = (await actorName()) ?? "unknown";
  appendDraftItem<Activity>("astro_activities", () => [], { target_type: "store", target_id: String(cur.restaurant_id), kind: "메모", body: `'${cur.snapshot.post.topic}' 게시물 리포트 초안 삭제`, author: who, created_at: new Date().toISOString() });
  return new NextResponse(null, { status: 204 });
}

/** POST { action: "refresh" | "approve" | "link" | "sent" | "revoke" } */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const cur = await load(id);
  if (cur instanceof NextResponse) return cur;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const who = (await actorName()) ?? "unknown";
  const now = new Date().toISOString();
  const bad = (msg: string, extra: object = {}) => NextResponse.json({ detail: msg, ...extra }, { status: 409 });

  if (action === "refresh") {
    // 초안만 — 보낸 리포트의 숫자가 나중에 바뀌면 "9/18 기준"이라고 적어 보낸 문장이 거짓이 된다.
    if (cur.status !== "DRAFT") return bad("초안만 수치를 다시 읽을 수 있습니다. 보낸 리포트는 갱신본을 만드세요.");
    const stores = (await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/"))?.restaurants ?? [];
    const store = stores.find((s) => s.restaurant_id === cur.restaurant_id);
    const plan = (await fetchPapillonMonths(3)).plans.find((p) => p.id === cur.plan_id);
    if (!store || !plan) return bad("매장이나 Papillon 기획을 찾지 못했습니다 (백엔드 연결 확인).");
    const ops = readDraft<StoreOps[]>("astro_store_ops", seedStoreOps).find((o) => o.id === store.restaurant_id);
    const snapshot = await buildSnapshot({ ...store, campus: ops?.campus ?? null }, plan, stores.filter((s) => s.is_affiliate !== false));
    snapshot.cohort_note = cohortNote(snapshot.metrics);
    // 문구는 사람이 쓴 것이라 그대로 둔다. 스냅샷에 없는 숫자를 쓴 문장은 승인 단계에서 걸린다.
    const updated = await save(id, { snapshot });
    if (updated instanceof NextResponse) return updated;
    return NextResponse.json({ report: updated, draft: draft() });
  }
  if (action === "approve") {
    if (cur.status !== "DRAFT") return bad("초안만 승인할 수 있습니다.");
    // 금지 표현·지어낸 숫자 — 경고가 아니라 차단
    const check = checkText(reportAllText(cur), cur.snapshot);
    if (!check.ok) return bad("발행할 수 없는 문장이 있습니다.", { problems: check.problems });
    // 점주 화면(리포트 양식)의 필수 값 — 비면 양식이 빨간 칸을 띄운다. 성과를 못 읽은 스냅샷이 대부분이다.
    const missing = templateMissing(cur);
    if (missing.length) return bad("리포트에 꼭 들어가야 할 값이 비어 있습니다. 성과가 모인 뒤 갱신본을 만드세요.", { problems: missing.map((m) => `${m} 없음`) });
    const updated = await save(id, { status: "APPROVED", approved_by: who, approved_at: now });
    if (updated instanceof NextResponse) return updated;
    return NextResponse.json({ report: updated, draft: draft() });
  }
  if (action === "link") {
    if (cur.status !== "APPROVED") return bad("승인된 리포트만 링크를 만들 수 있습니다.");
    // 공개 링크를 만드는 API 는 미리보기 우회가 없다 — 미리보기에서는 렌더까지만.
    if (isPreview() && !process.env.NEXT_PUBLIC_API_URL) return NextResponse.json({ detail: "미리보기 모드에서는 공개 링크를 발급하지 않습니다. 미리보기 버튼으로 페이지 모양만 확인하세요." }, { status: 501 });
    // 초안 저장소는 재배포 때 사라진다. 점주에게 나가는 링크는 영속 저장소가 붙기 전엔 만들지 않는다 (검토·미리보기까지는 파일로 다 된다).
    if (!reportStorePersistent()) return NextResponse.json({ detail: "이 저장소는 재배포 시 사라집니다. 실제 발송 전에 영속 저장소(DRAFT_DATA_DIR 볼륨 또는 백엔드 StoreReport)를 연결하세요." }, { status: 409 });
    // 40자 hex — 추측·열거 불가. 재발급하면 이전 링크는 죽는다(옛 숫자를 보게 두지 않는다).
    const token = randomBytes(20).toString("hex");
    const updated = await save(id, { token, status: "LINKED", linked_at: now, views: { count: 0, first_at: null, last_at: null } });
    if (updated instanceof NextResponse) return updated;
    appendDraftItem<Activity>("astro_activities", () => [], { target_type: "store", target_id: String(cur.restaurant_id), kind: "메모", body: `'${cur.snapshot.post.topic}' 게시물 리포트 링크 발급 (/r/${token.slice(0, 6)}…)`, author: who, created_at: now });
    return NextResponse.json({ report: updated, url: `/r/${token}`, draft: draft() });
  }
  if (action === "sent") {
    // 사람이 카톡으로 보낸 뒤 체크한다. 0920 부터는 링크 대신 PNG·HTML 파일로 보낸다 — 승인(APPROVED)에서 바로 보냄으로 간다.
    if (cur.status !== "APPROVED" && cur.status !== "LINKED") return bad("승인한 리포트만 '보냈음'으로 표시할 수 있습니다.");
    const updated = await save(id, { status: "SENT", sent_at: now });
    if (updated instanceof NextResponse) return updated;
    appendDraftItem<Activity>("astro_activities", () => [], { target_type: "store", target_id: String(cur.restaurant_id), kind: "카톡", body: `'${cur.snapshot.post.topic}' 게시물 리포트 ${cur.token ? "링크" : "파일"} 카톡 전송`, author: who, created_at: now });
    return NextResponse.json({ report: updated, draft: draft() });
  }
  if (action === "revoke") {
    if (cur.status === "REVOKED") return bad("이미 회수됐습니다.");
    const updated = await save(id, { status: "REVOKED", revoked_at: now });
    if (updated instanceof NextResponse) return updated;
    return NextResponse.json({ report: updated, draft: draft() });
  }
  return NextResponse.json({ detail: "알 수 없는 action" }, { status: 400 });
}
