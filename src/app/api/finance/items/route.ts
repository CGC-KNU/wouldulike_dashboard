import { NextRequest, NextResponse } from "next/server";
import { actorName, requireFinance } from "@/lib/draft/guard";
import { remoteSend } from "@/lib/draft/remote";
import { currentPeriodKst, newId, readItems, writeItems } from "@/lib/finance/store";
import { checkItem } from "@/lib/finance/validate";
import type { ExpenseItem } from "@/lib/finance/types";

/** 반복 항목 추가 — 「새로 나가는 비용」을 목록에 올린다. 기본 항목은 처음에 깔려 있다. */
export async function POST(req: NextRequest) {
  const deny = await requireFinance();
  if (deny) return deny;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // 시작 월을 안 주면 이번 달부터
  const checked = checkItem({ start_period: currentPeriodKst(), ...body }, false);
  if (!checked.ok) return NextResponse.json({ detail: checked.detail }, { status: 400 });
  const by = (await actorName()) ?? "unknown";
  const payload = { ...checked.value, key: null, is_default: false, active: true, updated_by: by };

  const r = await remoteSend<{ item: ExpenseItem }>("POST", "/api/finance/items/", payload);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "추가하지 못했습니다." }, { status: r.status });
    return NextResponse.json({ item: r.data!.item, draft: false }, { status: 201 });
  }
  const item = { id: newId("i"), memo: null, end_period: null, ...payload, updated_at: new Date().toISOString() } as ExpenseItem;
  writeItems([...readItems(), item]);
  return NextResponse.json({ item, draft: true }, { status: 201 });
}
