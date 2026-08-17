import { NextRequest } from "next/server";
import { proxyDelete } from "@/lib/apiProxy";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyDelete(`/api/bannerlab/copies/${id}/`);
}
