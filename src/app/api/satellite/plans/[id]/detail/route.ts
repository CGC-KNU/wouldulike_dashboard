import { NextRequest } from "next/server";
import { proxyGet } from "@/lib/apiProxy";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyGet(`/api/satellite/plans/${id}/detail/`);
}
