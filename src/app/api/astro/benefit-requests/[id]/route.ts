import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { remoteSend } from "@/lib/draft/remote";

/** 승인·거절 — **관리자만.** 백엔드도 한 번 더 본다. 승인하면 앱 카탈로그가 바뀐다. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const r = await remoteSend<unknown>("PATCH", `/api/astro/benefit-requests/${id}/`, body);
  if (!r.handled) {
    return NextResponse.json({ detail: "서버에 닿지 못해 처리하지 못했습니다." }, { status: 503 });
  }
  return NextResponse.json(r.data ?? {}, { status: r.status });
}
