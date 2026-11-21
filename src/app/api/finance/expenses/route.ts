import { NextRequest, NextResponse } from "next/server";
import { actorName, requireFinance } from "@/lib/draft/guard";
import { remoteGet, remoteSend } from "@/lib/draft/remote";
import { DEFAULT_ITEMS } from "@/lib/finance/defaults";
import { currentPeriodKst, newId, readEntries, readItems, writeEntries } from "@/lib/finance/store";
import { checkEntry, todayKst } from "@/lib/finance/validate";
import type { ExpenseEntry, ExpenseItem } from "@/lib/finance/types";

/**
 * 재무 · 출금 — 목록과 한 건 기록.
 *
 * 원본은 **백엔드 DB**(finance 앱)다. 계좌가 연결돼 있지 않아 출금은 사람이 직접 적는다 —
 * 고정 비용 항목(기본값 + 추가한 것)과, 실제로 나간 돈의 기록(항목의 그 달 지급 또는 한 번 나간 비용).
 * 백엔드가 아직 안 올라간 환경에서만 초안 저장소로 떨어지고, 응답의 `draft` 가 그걸 알린다.
 */

export async function GET() {
  const deny = await requireFinance();
  if (deny) return deny;

  const [ri, re] = await Promise.all([remoteGet<{ items: ExpenseItem[] }>("/api/finance/items/"), remoteGet<{ entries: ExpenseEntry[] }>("/api/finance/entries/")]);
  if (ri.handled || re.handled) {
    for (const r of [ri, re]) if (!r.ok) return NextResponse.json(r.data ?? { detail: "출금 장부를 읽지 못했습니다." }, { status: r.status || 502 });
    const items = [...(ri.data?.items ?? [])];
    // 기본 항목 깔기 — key 가 같은 건 백엔드가 두 번 만들지 않는다(멱등). 없는 것만 보낸다.
    const have = new Set(items.map((i) => i.key).filter(Boolean));
    const period = currentPeriodKst();
    for (const d of DEFAULT_ITEMS.filter((x) => !have.has(x.key))) {
      const r = await remoteSend<{ item: ExpenseItem }>("POST", "/api/finance/items/", { ...d, amount: null, start_period: period, active: true, is_default: true });
      if (r.ok && r.data?.item) items.push(r.data.item);
    }
    return NextResponse.json({ items, entries: re.data?.entries ?? [], draft: false });
  }
  return NextResponse.json({ items: readItems(), entries: readEntries(), draft: true });
}

/** POST — 나간 돈 한 건 기록. */
export async function POST(req: NextRequest) {
  const deny = await requireFinance();
  if (deny) return deny;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = checkEntry(body, false, todayKst());
  if (!checked.ok) return NextResponse.json({ detail: checked.detail }, { status: 400 });
  // 기록자는 서버가 찍는다 — 본문의 값을 믿지 않는다(감사 기록은 위조할 수 있으면 없는 것과 같다)
  const by = (await actorName()) ?? "unknown";
  const payload = { ...checked.value, created_by: by };

  const r = await remoteSend<{ entry: ExpenseEntry }>("POST", "/api/finance/entries/", payload);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "기록하지 못했습니다." }, { status: r.status });
    return NextResponse.json({ entry: r.data!.entry, draft: false }, { status: 201 });
  }
  const entry = { item_id: null, memo: null, ...payload, id: newId("e"), created_at: new Date().toISOString() } as ExpenseEntry;
  writeEntries([entry, ...readEntries()]);
  return NextResponse.json({ entry, draft: true }, { status: 201 });
}
