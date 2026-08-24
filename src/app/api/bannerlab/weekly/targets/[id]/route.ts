import { NextRequest } from "next/server";
import { proxyDelete } from "@/lib/apiProxy";

/** 대상(식당 1곳/팝업 1개) 삭제 — WeeklyTargetsPanel (2026-08-24 신설). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyDelete(`/api/bannerlab/weekly/targets/${id}/`);
}
