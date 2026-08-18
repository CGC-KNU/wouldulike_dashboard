import { NextRequest } from "next/server";
import { proxyDelete, proxyGet } from "@/lib/apiProxy";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyGet(`/api/bannerlab/weekly/semesters/${id}/`);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyDelete(`/api/bannerlab/weekly/semesters/${id}/`);
}
