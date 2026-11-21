import { NextRequest, NextResponse } from "next/server";
import { actorName, requireFinance } from "@/lib/draft/guard";
import { remoteSend } from "@/lib/draft/remote";
import { readFundings, writeFundings } from "@/lib/finance/store";
import { checkFunding, checkFundingWhole, todayKst } from "@/lib/finance/validate";
import type { FundingEvent } from "@/lib/finance/types";

/** 자금 조달 고치기(상태 변경 포함) · 취소. 백엔드는 지우지 않고 취소로 남긴다. */

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireFinance();
  if (deny) return deny;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = checkFunding(body, true, todayKst());
  if (!checked.ok) return NextResponse.json({ detail: checked.detail }, { status: 400 });

  const r = await remoteSend<{ funding: FundingEvent }>("PATCH", `/api/finance/fundings/${encodeURIComponent(id)}/`, checked.value);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "저장하지 못했습니다." }, { status: r.status });
    return NextResponse.json({ funding: r.data!.funding, draft: false });
  }
  const list = readFundings();
  const idx = list.findIndex((f) => f.id === id);
  if (idx === -1) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
  const next: FundingEvent = { ...list[idx], ...checked.value, updated_by: (await actorName()) ?? "unknown", updated_at: new Date().toISOString() };
  const whole = checkFundingWhole(next);
  if (whole) return NextResponse.json({ detail: whole }, { status: 400 });
  writeFundings(list.map((f, k) => (k === idx ? next : f)));
  return NextResponse.json({ funding: next, draft: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireFinance();
  if (deny) return deny;
  const { id } = await ctx.params;
  const r = await remoteSend<null>("DELETE", `/api/finance/fundings/${encodeURIComponent(id)}/`);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "지우지 못했습니다." }, { status: r.status });
    return new NextResponse(null, { status: 204 });
  }
  const list = readFundings();
  if (!list.some((f) => f.id === id)) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
  writeFundings(list.filter((f) => f.id !== id));
  return new NextResponse(null, { status: 204 });
}
