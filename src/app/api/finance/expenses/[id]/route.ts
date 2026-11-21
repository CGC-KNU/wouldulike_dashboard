import { NextRequest, NextResponse } from "next/server";
import { requireFinance } from "@/lib/draft/guard";
import { remoteSend } from "@/lib/draft/remote";
import { readEntries, writeEntries } from "@/lib/finance/store";
import { checkEntry, todayKst } from "@/lib/finance/validate";
import type { ExpenseEntry } from "@/lib/finance/types";

/** 출금 한 건 고치기 · 지우기. 잘못 적은 기록을 되돌릴 수 없으면 아무도 적지 않는다. */

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireFinance();
  if (deny) return deny;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = checkEntry(body, true, todayKst());
  if (!checked.ok) return NextResponse.json({ detail: checked.detail }, { status: 400 });

  const r = await remoteSend<{ entry: ExpenseEntry }>("PATCH", `/api/finance/entries/${encodeURIComponent(id)}/`, checked.value);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "저장하지 못했습니다." }, { status: r.status });
    return NextResponse.json({ entry: r.data!.entry, draft: false });
  }
  const list = readEntries();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
  const next = { ...list[idx], ...checked.value };
  writeEntries(list.map((e, i) => (i === idx ? next : e)));
  return NextResponse.json({ entry: next, draft: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireFinance();
  if (deny) return deny;
  const { id } = await ctx.params;

  const r = await remoteSend<null>("DELETE", `/api/finance/entries/${encodeURIComponent(id)}/`);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "지우지 못했습니다." }, { status: r.status });
    return new NextResponse(null, { status: 204 });
  }
  const list = readEntries();
  if (!list.some((e) => e.id === id)) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
  writeEntries(list.filter((e) => e.id !== id));
  return new NextResponse(null, { status: 204 });
}
