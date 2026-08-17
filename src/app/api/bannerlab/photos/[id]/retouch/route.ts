import { NextRequest } from "next/server";
import { proxyBody } from "@/lib/apiProxy";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyBody("POST", `/api/bannerlab/photos/${id}/retouch/`, {});
}
