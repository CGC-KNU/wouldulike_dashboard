import { NextRequest, NextResponse } from "next/server";
import { actorName, requireFinance } from "@/lib/draft/guard";
import { remoteGet, remoteSend } from "@/lib/draft/remote";
import { newId, readFundings, writeFundings } from "@/lib/finance/store";
import { checkFunding, checkFundingWhole, todayKst } from "@/lib/finance/validate";
import type { FundingEvent } from "@/lib/finance/types";

/**
 * 재무 · 자금 조달 — SAFE · 지원금 · 상금 · 대출. 순번(영업 유출 − 영업 유입)에 넣지 않고 따로 적는다.
 * 원본은 백엔드(astro/finance.py). 백엔드가 없는 환경에서만 초안 저장소.
 */
export async function GET() {
  const deny = await requireFinance();
  if (deny) return deny;
  const r = await remoteGet<{ fundings: FundingEvent[] }>("/api/finance/fundings/");
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "자금 조달을 읽지 못했습니다." }, { status: r.status || 502 });
    return NextResponse.json({ fundings: r.data?.fundings ?? [], draft: false });
  }
  return NextResponse.json({ fundings: readFundings(), draft: true });
}

export async function POST(req: NextRequest) {
  const deny = await requireFinance();
  if (deny) return deny;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = checkFunding(body, false, todayKst());
  if (!checked.ok) return NextResponse.json({ detail: checked.detail }, { status: 400 });
  const whole = checkFundingWhole(checked.value);
  if (whole) return NextResponse.json({ detail: whole }, { status: 400 });

  const r = await remoteSend<{ funding: FundingEvent }>("POST", "/api/finance/fundings/", checked.value);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "저장하지 못했습니다." }, { status: r.status });
    return NextResponse.json({ funding: r.data!.funding, draft: false }, { status: 201 });
  }
  const funding = { memo: null, ...checked.value, id: newId("f"), updated_by: (await actorName()) ?? "unknown", updated_at: new Date().toISOString() } as FundingEvent;
  writeFundings([...readFundings(), funding]);
  return NextResponse.json({ funding, draft: true }, { status: 201 });
}
