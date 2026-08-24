import { NextRequest } from "next/server";
import { proxyBody } from "@/lib/apiProxy";

/** 후보 선택 + 이동 URL 지정 — 슬랙 모달과 같은 동작을 대시보드에서 직접 (2026-08-24 신설). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyBody("POST", `/api/bannerlab/weekly/candidates/${id}/select/`, body);
}
