import { NextRequest } from "next/server";
import { proxyBody, proxyDelete } from "@/lib/apiProxy";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyBody("POST", `/api/satellite/plans/${id}/ready/`, await req.json().catch(() => ({})));
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyDelete(`/api/satellite/plans/${id}/ready/`);
}
