import { NextRequest } from "next/server";
import { proxyBody, proxyDelete } from "@/lib/apiProxy";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyDelete(`/api/satellite/assets/${id}/`);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyBody("PATCH", `/api/satellite/assets/${id}/`, body);
}
