import { NextRequest } from "next/server";
import { proxyBody, proxyGet } from "@/lib/apiProxy";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyGet(`/api/bannerlab/weekly/weeks/${id}/`);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyBody("PATCH", `/api/bannerlab/weekly/weeks/${id}/`, body);
}
