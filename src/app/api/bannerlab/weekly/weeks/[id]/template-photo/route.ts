import { NextRequest } from "next/server";
import { proxyBody, proxyDelete } from "@/lib/apiProxy";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyBody("POST", `/api/bannerlab/weekly/weeks/${id}/template-photo/`, body);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyDelete(`/api/bannerlab/weekly/weeks/${id}/template-photo/`);
}
