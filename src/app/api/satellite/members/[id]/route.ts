import { NextRequest } from "next/server";
import { proxyBody } from "@/lib/apiProxy";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyBody("PATCH", `/api/satellite/members/${id}/`, body);
}
