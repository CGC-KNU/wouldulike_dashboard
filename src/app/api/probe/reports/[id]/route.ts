import { NextRequest, NextResponse } from "next/server";
import { actorName, requireTool } from "@/lib/draft/guard";
import { appendDraftItem, readDraft } from "@/lib/draft/store";
import { ReportStoreError, deleteReport, getReport, patchReport, reportsOnBackend } from "@/lib/draft/reportStore";
import { checkText, cohortNote, hasCurationMarker, ownerNumbers, refreshText, reportAllText } from "@/lib/draft/report";
import { parseManual, type ManualInput } from "@/lib/draft/reportManual";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { fetchPapillonMonths } from "@/lib/draft/papillon";
import { buildSnapshot } from "@/lib/draft/snapshot";
import { seedStoreOps } from "@/lib/draft/seed";
import { templateMissing } from "@/lib/draft/reportTemplateData";
import type { Activity, BackendRestaurant, ReportProposal, StoreOps, StoreReport } from "@/lib/draft/types";

const storeError = (e: unknown) => NextResponse.json({ detail: e instanceof ReportStoreError ? e.message : "리포트 저장소 오류" }, { status: e instanceof ReportStoreError && e.status < 500 ? e.status : 502 });
const draft = () => !reportsOnBackend();
/** Astro 매장 활동 기록 — 앱에 없는 협찬 매장(restaurant_id null)은 Astro 에 매장이 없어 남기지 않는다. */
const logStore = (cur: StoreReport, a: Omit<Activity, "id" | "target_type" | "target_id">) => {
  if (cur.restaurant_id !== null) appendDraftItem<Activity>("astro_activities", () => [], { target_type: "store", target_id: String(cur.restaurant_id), ...a });
};

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

/** PATCH — 문구와, 인스타 앱에서 손으로 옮기는 값(1003 — 장별 좋아요 · 연령 비중)을 고친다. 인스타 API 숫자는 읽기 전용. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const cur = await load(id);
  if (cur instanceof NextResponse) return cur;
  if (cur.status === "LINKED" || cur.status === "SENT" || cur.status === "REVOKED") return NextResponse.json({ detail: "링크가 나간 리포트는 고칠 수 없습니다. 갱신본을 만드세요." }, { status: 409 });
  const b = (await req.json().catch(() => ({}))) as { title?: string; summary?: string; interpretation?: string[]; proposals?: Pick<ReportProposal, "rule" | "text" | "approved">[]; manual?: ManualInput | null };
  const who = (await actorName()) ?? "unknown";
  const now = new Date().toISOString();
  const patch: Partial<StoreReport> = { status: "DRAFT", approved_by: null, approved_at: null }; // 문구가 바뀌면 승인은 무효
  if (typeof b.title === "string") patch.title = b.title.trim().slice(0, 80);
  if (typeof b.summary === "string") patch.summary = b.summary.trim().slice(0, 300);
  if (Array.isArray(b.interpretation)) patch.interpretation = b.interpretation.map((s) => String(s).trim().slice(0, 300)).filter(Boolean).slice(0, 8); // 자동 글은 최대 여섯 줄(인사·큐레이션·조회·연령·반응·가게 장) + 사람이 덧붙인 줄
  if (Array.isArray(b.proposals)) {
    patch.proposals = cur.proposals.map((p) => {
      const n = b.proposals!.find((x) => x.rule === p.rule);
      if (!n) return p;
      const text = typeof n.text === "string" ? n.text.trim().slice(0, 400) : p.text;
      const changed = text !== p.text;
      return { ...p, text, approved: Boolean(n.approved), edited_by: changed ? who : p.edited_by, edited_at: changed ? now : p.edited_at };
    });
  }
  if (b.manual !== undefined) {
    // 사장님이 보는 글이 바뀌므로 문구와 같이 승인을 무효로 한다(위 patch.status).
    const fmt = cur.snapshot.report_data?.available ? cur.snapshot.report_data.post?.format : cur.snapshot.post.format;
    const { manual, errors } = parseManual(b.manual, {
      likes: ownerNumbers(cur.snapshot).likes ?? null, carousel: fmt === "carousel",
      curation: hasCurationMarker(cur.snapshot.post.topic), cards: cur.snapshot.report_data?.post?.card_count ?? null,
    });
    if (errors.length) return NextResponse.json({ detail: errors.join(" ") }, { status: 400 });
    const snapshot = { ...cur.snapshot, manual };
    patch.snapshot = snapshot;
    // 그 값으로 쓰는 문장(연령 · 가게 장 좋아요)은 자동 문장이다 — 손대지 않은 자동 문장만 새 값으로 다시 쓴다.
    const text = refreshText({ summary: patch.summary ?? cur.summary, interpretation: patch.interpretation ?? cur.interpretation, snapshot: cur.snapshot }, snapshot);
    if (text.interpretation) patch.interpretation = text.interpretation.slice(0, 8);
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
  logStore(cur, { kind: "메모", body: `'${cur.snapshot.post.topic}' 게시물 리포트 초안 삭제`, author: who, created_at: new Date().toISOString() });
  return new NextResponse(null, { status: 204 });
}

/**
 * POST { action: "refresh" | "finalize" | "sent" | "revoke" }
 *
 * 1013: 「승인」(DRAFT→APPROVED)·「링크 발급」(→LINKED)은 뺐다. 1007 부터 승인 한 번이 finalize(DRAFT→SENT)이고,
 * 0920 부터 사장님께는 링크 대신 파일을 보낸다. `sent` 는 그 전에 승인·링크까지만 간 옛 리포트를 끝내는 길로만 남긴다.
 * 이미 나간 링크(/r/<토큰>)는 그대로 열리고 `revoke` 로 닫는다.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const cur = await load(id);
  if (cur instanceof NextResponse) return cur;
  const { action, reason } = (await req.json().catch(() => ({}))) as { action?: string; reason?: string };
  const who = (await actorName()) ?? "unknown";
  const now = new Date().toISOString();
  const bad = (msg: string, extra: object = {}) => NextResponse.json({ detail: msg, ...extra }, { status: 409 });

  if (action === "refresh") {
    // 초안만 — 보낸 리포트의 숫자가 나중에 바뀌면 "9/18 기준"이라고 적어 보낸 문장이 거짓이 된다.
    if (cur.status !== "DRAFT") return bad("초안만 수치를 다시 읽을 수 있습니다. 보낸 리포트는 갱신본을 만드세요.");
    const stores = (await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/"))?.restaurants ?? [];
    // 앱에 없는 협찬 매장은 매장 표에 없다 — 만들 때 굳힌 이름을 그대로 쓴다
    const store = cur.restaurant_id === null ? { restaurant_id: null, name: cur.snapshot.store.name } : stores.find((s) => s.restaurant_id === cur.restaurant_id);
    const plan = (await fetchPapillonMonths(3)).plans.find((p) => p.id === cur.plan_id);
    if (!store || !plan) return bad("매장이나 Papillon 기획을 찾지 못했습니다 (백엔드 연결 확인).");
    const ops = store.restaurant_id === null ? undefined : readDraft<StoreOps[]>("astro_store_ops", seedStoreOps).find((o) => o.id === store.restaurant_id);
    const snapshot = await buildSnapshot({ ...store, campus: ops?.campus ?? null }, plan, stores.filter((s) => s.is_affiliate !== false));
    snapshot.cohort_note = cohortNote(snapshot.metrics);
    // 손대지 않은 자동 문장은 새 숫자로 다시 쓰고, 사람이 고친 문장은 그대로 둔다(refreshText).
    // 손으로 옮긴 값은 인스타 API 에서 다시 못 읽는다 — 새 스냅샷으로 옮겨 둔다(1003)
    snapshot.manual = cur.snapshot.manual ?? null;
    const updated = await save(id, { snapshot, ...refreshText(cur, snapshot) });
    if (updated instanceof NextResponse) return updated;
    return NextResponse.json({ report: updated, draft: draft() });
  }
  if (action === "finalize") {
    // 1007: 승인 한 번으로 끝낸다 — 초안(DRAFT)에서 곧바로 최종 승인(SENT). 백엔드가 PNG 3장 + HTML 게시를 바로 깨운다.
    // 금지 표현·지어낸 숫자, 양식 필수 값은 막는다. 손으로 넣는 값이 비었는지는 화면이 경고로 묻고, 그래도 누르면 여기서는 받는다.
    if (cur.status !== "DRAFT") return bad("초안만 승인할 수 있습니다.");
    const check = checkText(reportAllText(cur), cur.snapshot);
    if (!check.ok) return bad("발행할 수 없는 문장이 있습니다.", { problems: check.problems });
    const missing = templateMissing(cur);
    if (missing.length) return bad("리포트에 꼭 들어가야 할 값이 비어 있습니다. 성과가 모인 뒤 갱신본을 만드세요.", { problems: missing.map((m) => `${m} 없음`) });
    const updated = await save(id, { status: "SENT", approved_by: who, approved_at: now, sent_at: now });
    if (updated instanceof NextResponse) return updated;
    logStore(cur, { kind: "메모", body: `'${cur.snapshot.post.topic}' 게시물 리포트 승인 (#ops-partner 에 PNG·HTML 게시)`, author: who, created_at: now });
    return NextResponse.json({ report: updated, draft: draft() });
  }
  if (action === "sent") {
    // 1007 전에 승인(APPROVED)·링크 발급(LINKED)까지만 간 옛 리포트를 끝낸다 — 「최종 승인」 버튼. 새 리포트는 finalize 로 바로 SENT 가 된다.
    if (cur.status !== "APPROVED" && cur.status !== "LINKED") return bad("승인한 리포트만 '보냈음'으로 표시할 수 있습니다.");
    const updated = await save(id, { status: "SENT", sent_at: now });
    if (updated instanceof NextResponse) return updated;
    logStore(cur, { kind: "카톡", body: `'${cur.snapshot.post.topic}' 게시물 리포트 ${cur.token ? "링크" : "파일"} 카톡 전송`, author: who, created_at: now });
    return NextResponse.json({ report: updated, draft: draft() });
  }
  if (action === "revoke") {
    if (cur.status === "REVOKED") return bad("이미 회수됐습니다.");
    // 보낸 리포트를 되돌릴 때는 사유가 필수다(1021) — 회수되면 게시물이 「리포트 없음」으로 돌아가 다시 만들 수 있다.
    const why = (reason ?? "").trim().slice(0, 300);
    if (cur.status === "SENT" && why.length < 2) return bad("되돌리는 사유를 적어 주세요.");
    const updated = await save(id, { status: "REVOKED", revoked_at: now, ...(why ? { snapshot: { ...cur.snapshot, undo: { reason: why, by: who, at: now } } } : {}) });
    if (updated instanceof NextResponse) return updated;
    if (why) logStore(cur, { kind: "메모", body: `'${cur.snapshot.post.topic}' 게시물 리포트 되돌림 — ${why}`, author: who, created_at: now });
    return NextResponse.json({ report: updated, draft: draft() });
  }
  return NextResponse.json({ detail: "알 수 없는 action" }, { status: 400 });
}
