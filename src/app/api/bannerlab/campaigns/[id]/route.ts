import { NextRequest } from "next/server";
import { proxyBody, proxyDelete, proxyGet } from "@/lib/apiProxy";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyGet(`/api/bannerlab/campaigns/${id}/`);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyBody("PATCH", `/api/bannerlab/campaigns/${id}/`, body);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyDelete(`/api/bannerlab/campaigns/${id}/`);
}
