import { NextRequest, NextResponse } from "next/server";
import { proxyBody, proxyGet } from "@/lib/apiProxy";

/** 주차 큐레이션 — GET/PATCH curation/, POST curation/generate/ · curation/send-slack/ */
type Ctx = { params: Promise<{ id: string; path?: string[] }> };

const ACTIONS = new Set(["generate", "send-slack"]);

async function target(ctx: Ctx): Promise<string | null> {
  const { id, path } = await ctx.params;
  if (!/^\d+$/.test(id)) return null;
  const action = (path ?? [])[0];
  if (!action) return `/api/bannerlab/weekly/weeks/${id}/curation/`;
  if ((path ?? []).length !== 1 || !ACTIONS.has(action)) return null;
  return `/api/bannerlab/weekly/weeks/${id}/curation/${action}/`;
}

const notFound = () => NextResponse.json({ detail: "없는 경로입니다." }, { status: 404 });

export async function GET(_req: NextRequest, ctx: Ctx) {
  const t = await target(ctx);
  return t ? proxyGet(t) : notFound();
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const t = await target(ctx);
  if (!t) return notFound();
  return proxyBody("PATCH", t, await req.json().catch(() => ({})));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const t = await target(ctx);
  if (!t) return notFound();
  return proxyBody("POST", t, await req.json().catch(() => ({})));
}
