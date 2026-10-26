import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { remoteGet } from "@/lib/draft/remote";

/**
 * 입점 신청 목록 — 사장님이 /join 에서 혼자 낸 신청. 승인 · 반려는 [id] 에서.
 * 세틀라이트는 서버 자격이 없다 — 요청한 팀원의 토큰으로 백엔드 관리자 경로를 부른다.
 *
 *   GET ?status=pending(기본) | pending,duplicate | all
 */
export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const st = req.nextUrl.searchParams.get("status") || "pending,duplicate";
  const r = await remoteGet<unknown>("/api/partner/admin/applications/", `status=${encodeURIComponent(st)}`);
  if (!r.handled) return NextResponse.json({ applications: [], counts: {}, offline: true });
  return NextResponse.json(r.data ?? { detail: "목록을 불러오지 못했습니다." }, { status: r.ok ? 200 : r.status || 502 });
}
