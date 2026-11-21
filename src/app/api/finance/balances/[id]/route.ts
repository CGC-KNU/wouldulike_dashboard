import { NextRequest, NextResponse } from "next/server";
import { actorName, requireFinance } from "@/lib/draft/guard";
import { remoteSend } from "@/lib/draft/remote";
import { readBalances, writeBalances } from "@/lib/finance/store";
import { checkBalance, todayKst } from "@/lib/finance/validate";
import type { AccountBalance } from "@/lib/finance/types";

/** 월말 잔고 고치기 · 지우기. 백엔드는 지우지 않고 취소로 남긴다. */

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireFinance();
  if (deny) return deny;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = checkBalance(body, true, todayKst());
  if (!checked.ok) return NextResponse.json({ detail: checked.detail }, { status: 400 });

  const r = await remoteSend<{ balance: AccountBalance }>("PATCH", `/api/finance/balances/${encodeURIComponent(id)}/`, checked.value);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "저장하지 못했습니다." }, { status: r.status });
    return NextResponse.json({ balance: r.data!.balance, draft: false });
  }
  const list = readBalances();
  const idx = list.findIndex((b) => b.id === id);
  if (idx === -1) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
  const by = (await actorName()) ?? "unknown";
  const now = new Date().toISOString();
  const cur = list[idx];
  const next: AccountBalance = { ...cur, ...checked.value, updated_by: by, updated_at: now };
  if ("reconciled" in checked.value) {
    if (next.reconciled && !cur.reconciled) Object.assign(next, { reconciled_by: by, reconciled_at: now });
    if (!next.reconciled) Object.assign(next, { reconciled_by: null, reconciled_at: null });
  }
  writeBalances(list.map((b, k) => (k === idx ? next : b)));
  return NextResponse.json({ balance: next, draft: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireFinance();
  if (deny) return deny;
  const { id } = await ctx.params;
  const r = await remoteSend<null>("DELETE", `/api/finance/balances/${encodeURIComponent(id)}/`);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "지우지 못했습니다." }, { status: r.status });
    return new NextResponse(null, { status: 204 });
  }
  const list = readBalances();
  if (!list.some((b) => b.id === id)) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
  writeBalances(list.filter((b) => b.id !== id));
  return new NextResponse(null, { status: 204 });
}
