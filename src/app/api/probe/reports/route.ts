import { NextRequest, NextResponse } from "next/server";
import { actorName, requireTool } from "@/lib/draft/guard";
import { ReportStoreError, listReports, reportsOnBackend } from "@/lib/draft/reportStore";
import { createReportDraft } from "@/lib/draft/reportCreate";

/**
 * Probe · 매장 리포트 (점주에게 보내는 공개 링크의 원본).
 *
 * 흐름: 만들기(스냅샷 고정) → 검토·문구 수정 → 승인(금지 표현 검사) → 링크 발급(토큰) → 카톡은 사람 → 열람.
 * 저장은 백엔드 `probe.StoreReport`(reportStore.ts). 백엔드가 없는 로컬·미리보기에서만 초안 파일.
 */

const storeError = (e: unknown) => e instanceof ReportStoreError ? NextResponse.json({ detail: e.message }, { status: e.status >= 500 ? 502 : e.status }) : null;
const draftNote = () => (reportsOnBackend() ? {} : { draft: true, draft_note: "리포트는 초안 저장소에 있습니다. 백엔드에 붙으면 옮겨 갑니다." });

export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const status = req.nextUrl.searchParams.get("status");
  const rid = req.nextUrl.searchParams.get("restaurant_id");
  try {
    const list = await listReports({ status: status ?? undefined, restaurant_id: rid ? Number(rid) : undefined });
    return NextResponse.json({ reports: list, ...draftNote() });
  } catch (e) {
    return storeError(e) ?? NextResponse.json({ detail: "리포트를 읽지 못했습니다." }, { status: 502 });
  }
}

/** POST { restaurant_id, plan_id } — 지금 값으로 스냅샷을 굳힌 리포트 초안을 만든다(reportCreate.ts). */
export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const body = (await req.json().catch(() => ({}))) as { restaurant_id?: number | null; store_name?: string; plan_id?: number; force?: boolean };
  const out = await createReportDraft({ ...body, actor: (await actorName()) ?? "unknown" });
  if (!out.ok) return NextResponse.json({ detail: out.detail, ...(out.report ? { report: out.report } : {}) }, { status: out.status });
  return NextResponse.json({ report: out.report, ...draftNote() }, { status: 201 });
}
