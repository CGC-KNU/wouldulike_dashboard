import { NextRequest } from "next/server";
import { proxyBody, proxyDelete } from "@/lib/apiProxy";

/**
 * PlanTable(주제표)의 인라인 수정·삭제가 쓰는 라우트.
 *
 * 이 파일이 없었던 동안은 PapillonDashboard.tsx 의 patch()/remove() 가 계속 이
 * 경로로 요청을 보냈지만 매칭되는 라우트가 없어 전부 404 로 조용히 실패했다 —
 * 다른 신규 엔드포인트들과 같은 누락 패턴 (proxy route 만 빠짐).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyBody("PATCH", `/api/satellite/plans/${id}/`, body);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyDelete(`/api/satellite/plans/${id}/`);
}
