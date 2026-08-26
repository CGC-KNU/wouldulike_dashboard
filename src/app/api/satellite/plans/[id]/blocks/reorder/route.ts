import { NextRequest } from "next/server";
import { proxyBody } from "@/lib/apiProxy";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyBody("PATCH", `/api/satellite/plans/${id}/blocks/reorder/`, await req.json().catch(() => ({})));
}
