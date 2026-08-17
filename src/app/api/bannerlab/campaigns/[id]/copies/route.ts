import { NextRequest } from "next/server";
import { proxyBody } from "@/lib/apiProxy";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyBody("POST", `/api/bannerlab/campaigns/${id}/copies/`, body);
}
