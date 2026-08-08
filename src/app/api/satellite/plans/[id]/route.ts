import { NextRequest } from "next/server";
import { proxyBody, proxyDelete } from "@/lib/apiProxy";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyBody("PATCH", `/api/satellite/plans/${id}/`, await req.json());
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyDelete(`/api/satellite/plans/${id}/`);
}
