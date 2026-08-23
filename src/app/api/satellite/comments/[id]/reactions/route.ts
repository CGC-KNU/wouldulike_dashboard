import { NextRequest } from "next/server";
import { proxyBody } from "@/lib/apiProxy";

/** 댓글 이모지 반응 토글 — CommentThread.tsx (2026-08-23 신설, RD 요청). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyBody("POST", `/api/satellite/comments/${id}/reactions/`, body);
}
