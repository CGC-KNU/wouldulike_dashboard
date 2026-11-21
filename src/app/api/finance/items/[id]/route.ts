import { NextRequest, NextResponse } from "next/server";
import { actorName, requireFinance } from "@/lib/draft/guard";
import { remoteSend } from "@/lib/draft/remote";
import { readEntries, readItems, writeItems } from "@/lib/finance/store";
import { checkItem } from "@/lib/finance/validate";
import type { ExpenseItem } from "@/lib/finance/types";

/**
 * 반복 항목 고치기 · 지우기.
 * 기본 항목은 **지우지 않고 쉬게만** 한다(active=false) — 지우면 다음 접속 때 다시 깔린다.
 * 지급 기록이 하나라도 달린 항목도 지우지 않는다: 지난 달 장부의 항목 이름이 사라지면 안 된다. 쉬게 하면 된다.
 */

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireFinance();
  if (deny) return deny;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = checkItem(body, true);
  if (!checked.ok) return NextResponse.json({ detail: checked.detail }, { status: 400 });
  const by = (await actorName()) ?? "unknown";
  const patch = { ...checked.value, updated_by: by };

  const r = await remoteSend<{ item: ExpenseItem }>("PATCH", `/api/finance/items/${encodeURIComponent(id)}/`, patch);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "저장하지 못했습니다." }, { status: r.status });
    return NextResponse.json({ item: r.data!.item, draft: false });
  }
  const list = readItems();
  const idx = list.findIndex((i) => i.id === id);
  if (idx === -1) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
  const next = { ...list[idx], ...patch, updated_at: new Date().toISOString() };
  if (next.end_period && next.end_period < next.start_period) return NextResponse.json({ detail: "종료 월이 시작 월보다 앞입니다." }, { status: 400 });
  writeItems(list.map((i, k) => (k === idx ? next : i)));
  return NextResponse.json({ item: next, draft: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireFinance();
  if (deny) return deny;
  const { id } = await ctx.params;

  const r = await remoteSend<null>("DELETE", `/api/finance/items/${encodeURIComponent(id)}/`);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "지우지 못했습니다." }, { status: r.status });
    return new NextResponse(null, { status: 204 });
  }
  const list = readItems();
  const found = list.find((i) => i.id === id);
  if (!found) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
  if (found.is_default) return NextResponse.json({ detail: "기본 항목은 지울 수 없습니다. 쉬게 하세요." }, { status: 409 });
  if (readEntries().some((e) => e.item_id === id)) return NextResponse.json({ detail: "지급 기록이 있는 항목은 지울 수 없습니다. 쉬게 하세요." }, { status: 409 });
  writeItems(list.filter((i) => i.id !== id));
  return new NextResponse(null, { status: 204 });
}
