import { NextRequest } from "next/server";
import { proxyBody, proxyGet } from "@/lib/apiProxy";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyGet(`/api/satellite/plans/${id}/comments/`);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyBody("POST", `/api/satellite/plans/${id}/comments/`, body);
}
