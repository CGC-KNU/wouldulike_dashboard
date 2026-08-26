import { NextRequest } from "next/server";
import { proxyBody } from "@/lib/apiProxy";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyBody("POST", `/api/satellite/plans/${id}/blocks/image/presign/`, await req.json().catch(() => ({})));
}
