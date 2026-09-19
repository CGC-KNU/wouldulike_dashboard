import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { actorName, requireTool } from "@/lib/draft/guard";
import { isPreview } from "@/lib/draft/previewStores";
import { appendDraftItem, patchDraftItem, readDraft } from "@/lib/draft/store";
import { checkText, reportAllText } from "@/lib/draft/report";
import { templateMissing } from "@/lib/draft/reportTemplateData";
import type { Activity, ReportProposal, StoreReport } from "@/lib/draft/types";

const KEY = "probe_reports";
const seed = (): StoreReport[] => [];

/** PATCH — 문구만 고친다. 스냅샷 숫자는 읽기 전용. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const cur = readDraft<StoreReport[]>(KEY, seed).find((r) => r.id === id);
  if (!cur) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
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
  const updated = patchDraftItem<StoreReport>(KEY, seed, id, patch);
  return NextResponse.json({ report: updated, draft: true });
}

/** POST { action: "approve" | "link" | "revoke" } */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const cur = readDraft<StoreReport[]>(KEY, seed).find((r) => r.id === id);
  if (!cur) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const who = (await actorName()) ?? "unknown";
  const now = new Date().toISOString();
  const bad = (msg: string, extra: object = {}) => NextResponse.json({ detail: msg, ...extra }, { status: 409 });

  if (action === "approve") {
    if (cur.status !== "DRAFT") return bad("초안만 승인할 수 있습니다.");
    // 금지 표현·지어낸 숫자 — 경고가 아니라 차단
    const check = checkText(reportAllText(cur), cur.snapshot);
    if (!check.ok) return bad("발행할 수 없는 문장이 있습니다.", { problems: check.problems });
    // 점주 화면(리포트 양식)의 필수 값 — 비면 양식이 빨간 칸을 띄운다. 성과를 못 읽은 스냅샷이 대부분이다.
    const missing = templateMissing(cur);
    if (missing.length) return bad("리포트에 꼭 들어가야 할 값이 비어 있습니다. 성과가 모인 뒤 갱신본을 만드세요.", { problems: missing.map((m) => `${m} 없음`) });
    const updated = patchDraftItem<StoreReport>(KEY, seed, id, { status: "APPROVED", approved_by: who, approved_at: now });
    return NextResponse.json({ report: updated, draft: true });
  }
  if (action === "link") {
    if (cur.status !== "APPROVED") return bad("승인된 리포트만 링크를 만들 수 있습니다.");
    // 공개 링크를 만드는 API 는 미리보기 우회가 없다 — 미리보기에서는 렌더까지만.
    if (isPreview() && !process.env.NEXT_PUBLIC_API_URL) return NextResponse.json({ detail: "미리보기 모드에서는 공개 링크를 발급하지 않습니다. 미리보기 버튼으로 페이지 모양만 확인하세요." }, { status: 501 });
    // 초안 저장소는 재배포 때 사라진다. 점주에게 나가는 링크는 영속 저장소가 붙기 전엔 만들지 않는다 (검토·미리보기까지는 파일로 다 된다).
    if (!process.env.DRAFT_DATA_DIR && process.env.REPORT_STORE !== "persistent") return NextResponse.json({ detail: "이 저장소는 재배포 시 사라집니다. 실제 발송 전에 영속 저장소(DRAFT_DATA_DIR 볼륨 또는 백엔드 StoreReport)를 연결하세요." }, { status: 409 });
    // 40자 hex — 추측·열거 불가. 재발급하면 이전 링크는 죽는다(옛 숫자를 보게 두지 않는다).
    const token = randomBytes(20).toString("hex");
    const updated = patchDraftItem<StoreReport>(KEY, seed, id, { token, status: "LINKED", linked_at: now, views: { count: 0, first_at: null, last_at: null } });
    appendDraftItem<Activity>("astro_activities", () => [], { target_type: "store", target_id: String(cur.restaurant_id), kind: "메모", body: `'${cur.snapshot.post.topic}' 게시물 리포트 링크 발급 (/r/${token.slice(0, 6)}…)`, author: who, created_at: now });
    return NextResponse.json({ report: updated, url: `/r/${token}`, draft: true });
  }
  if (action === "sent") {
    // 발급 ≠ 발송. 사람이 카톡으로 보낸 뒤 체크한다 — 이게 있어야 "보냈는데 안 열었다"와 "안 보냈다"가 갈린다.
    if (cur.status !== "LINKED") return bad("링크를 발급한 리포트만 '보냈음'으로 표시할 수 있습니다.");
    const updated = patchDraftItem<StoreReport>(KEY, seed, id, { status: "SENT", sent_at: now });
    appendDraftItem<Activity>("astro_activities", () => [], { target_type: "store", target_id: String(cur.restaurant_id), kind: "카톡", body: `'${cur.snapshot.post.topic}' 게시물 리포트 링크 전송`, author: who, created_at: now });
    return NextResponse.json({ report: updated, draft: true });
  }
  if (action === "revoke") {
    if (cur.status === "REVOKED") return bad("이미 회수됐습니다.");
    const updated = patchDraftItem<StoreReport>(KEY, seed, id, { status: "REVOKED", revoked_at: now });
    return NextResponse.json({ report: updated, draft: true });
  }
  return NextResponse.json({ detail: "알 수 없는 action" }, { status: 400 });
}
