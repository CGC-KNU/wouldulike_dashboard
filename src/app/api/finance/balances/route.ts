import { NextRequest, NextResponse } from "next/server";
import { actorName, requireFinance } from "@/lib/draft/guard";
import { remoteGet, remoteSend } from "@/lib/draft/remote";
import { newId, readBalances, writeBalances } from "@/lib/finance/store";
import { checkBalance, todayKst } from "@/lib/finance/validate";
import type { AccountBalance } from "@/lib/finance/types";

/**
 * 재무 · 월말 잔고 — 계좌별로 통장을 보고 적는다. 장부로 굴린 잔고와 맞춰 보는 대사의 기준이다.
 * 원본은 백엔드(astro/finance.py, AdminConfig `finance:ledger`). 백엔드가 없는 환경에서만 초안 저장소.
 */
export async function GET() {
  const deny = await requireFinance();
  if (deny) return deny;
  const r = await remoteGet<{ balances: AccountBalance[] }>("/api/finance/balances/");
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "월말 잔고를 읽지 못했습니다." }, { status: r.status || 502 });
    return NextResponse.json({ balances: r.data?.balances ?? [], draft: false });
  }
  return NextResponse.json({ balances: readBalances(), draft: true });
}

export async function POST(req: NextRequest) {
  const deny = await requireFinance();
  if (deny) return deny;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = checkBalance(body, false, todayKst());
  if (!checked.ok) return NextResponse.json({ detail: checked.detail }, { status: 400 });

  const r = await remoteSend<{ balance: AccountBalance }>("POST", "/api/finance/balances/", checked.value);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "저장하지 못했습니다." }, { status: r.status });
    return NextResponse.json({ balance: r.data!.balance, draft: false }, { status: 201 });
  }
  // 대사 완료자는 서버가 찍는다 — 본문 값을 믿지 않는다
  const by = (await actorName()) ?? "unknown";
  const now = new Date().toISOString();
  const v = checked.value;
  const balance = { memo: null, reconciled: false, ...v, id: newId("b"), reconciled_by: v.reconciled ? by : null, reconciled_at: v.reconciled ? now : null, updated_by: by, updated_at: now } as AccountBalance;
  writeBalances([...readBalances(), balance]);
  return NextResponse.json({ balance, draft: true }, { status: 201 });
}
