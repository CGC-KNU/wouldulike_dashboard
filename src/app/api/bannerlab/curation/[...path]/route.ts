import { NextRequest, NextResponse } from "next/server";
import { proxyBody, proxyDelete, proxyGet } from "@/lib/apiProxy";

/**
 * 큐레이션 자동화 프록시 — /api/bannerlab/curation/<path>/ 를 백엔드로 그대로 넘긴다.
 * (양식 · 특정일 · 미리보기 · 배너 다시 만들기/통과/제외). 엔드포인트 목록은 백엔드
 * bannerlab/views_curation.py 머리말 참고. 크론(internal/)은 여기서 막는다.
 */
type Ctx = { params: Promise<{ path: string[] }> };

async function target(ctx: Ctx): Promise<string | null> {
  const { path } = await ctx.params;
  const safe = (path ?? []).filter((p) => /^[A-Za-z0-9_-]+$/.test(p));
  if (!safe.length || safe.length !== path.length || safe[0] === "internal") return null;
  return `/api/bannerlab/curation/${safe.join("/")}/`;
}

const notFound = () => NextResponse.json({ detail: "없는 경로입니다." }, { status: 404 });

export async function GET(req: NextRequest, ctx: Ctx) {
  const t = await target(ctx);
  return t ? proxyGet(t, req.nextUrl.searchParams.toString()) : notFound();
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const t = await target(ctx);
  if (!t) return notFound();
  return proxyBody("POST", t, await req.json().catch(() => ({})));
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const t = await target(ctx);
  if (!t) return notFound();
  return proxyBody("PATCH", t, await req.json().catch(() => ({})));
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const t = await target(ctx);
  return t ? proxyDelete(t) : notFound();
}
