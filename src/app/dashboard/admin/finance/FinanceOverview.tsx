"use client";

import { useMemo, useState } from "react";
import { IconArrowRight, IconRefresh } from "@tabler/icons-react";
import { byCategory, changePct, dueRows, dueTotals, monthlySeries, periodOf, recentPeriods, sortByDateDesc, unknownIncomeCount, won } from "@/lib/finance/calc";
import { INCOME_SOURCE_LABEL } from "@/lib/finance/types";
import { Button, Card, Chip, DraftBadge, Empty, Kpi, Notice, PageHeader, Select, Skeleton, periodLocal, todayLocal } from "../_shared/ui";
import FlowChart from "./FlowChart";
import { useFinance } from "./useFinance";

/**
 * 재무 · 현황 — 대표 둘이 열면 처음 보는 화면.
 *
 * 위에서 아래로: 이번 달 숫자 넷(입금 · 출금 · 순입금 · 남은 예정) → 6개월 막대 → 이번 달 예정 출금 · 분류별 출금 → 최근 거래.
 * 큰 숫자 하나로 끝내지 않고 「막힌 것」(미기록 지급, 금액 미입력)을 같은 화면에서 먼저 보이게 한다.
 * 입금은 Astro 기록을 읽은 것, 출금은 대표가 적은 장부다 — 계좌가 연결돼 있지 않아서다.
 */

const monthLabel = (p: string) => `${p.slice(0, 4)}년 ${Number(p.slice(5))}월`;
const signed = (n: number) => `${n < 0 ? "−" : ""}${won(Math.abs(n))}`;
const pctText = (p: number | null) => (p === null ? "지난달 기록 없음" : `지난달 대비 ${p > 0 ? "+" : ""}${p}%`);

export default function FinanceOverview({ onGo }: { onGo?: (tab: string) => void }) {
  const f = useFinance();
  const thisPeriod = periodLocal();
  const [period, setPeriod] = useState(thisPeriod);
  const today = todayLocal();

  const periods = useMemo(() => recentPeriods(thisPeriod, 12).reverse(), [thisPeriod]);
  const series = useMemo(() => monthlySeries(f.income, f.entries, recentPeriods(period, 6)), [f.income, f.entries, period]);
  const cur = series[series.length - 1];
  const prev = series[series.length - 2];
  const due = useMemo(() => dueRows(f.items, f.entries, period, today), [f.items, f.entries, period, today]);
  const dueSum = useMemo(() => dueTotals(due), [due]);
  const cats = useMemo(() => byCategory(f.entries, period), [f.entries, period]);
  const catMax = Math.max(1, ...cats.map((c) => c.amount));
  const unknownIn = unknownIncomeCount(f.income, period);
  const overdue = due.filter((d) => d.overdue);

  /** 최근 거래 — 입금과 출금을 날짜순으로 한 줄씩. */
  const recent = useMemo(() => {
    const rows = [
      ...f.income.map((i) => ({ id: i.id, paid_on: i.paid_on, kind: "in" as const, name: i.name, sub: INCOME_SOURCE_LABEL[i.source], amount: i.amount })),
      ...f.entries.map((e) => ({ id: `e${e.id}`, paid_on: e.paid_on, kind: "out" as const, name: e.name, sub: e.category, amount: e.amount })),
    ].filter((r) => periodOf(r.paid_on) === period);
    return sortByDateDesc(rows).slice(0, 8);
  }, [f.income, f.entries, period]);

  const showSkeleton = f.loading && !f.income.length && !f.entries.length;

  return (
    <>
      <PageHeader
        title="재무 현황"
        description="들어온 돈은 Astro 기록에서, 나간 돈은 직접 적은 장부에서 가져옵니다. 대표만 볼 수 있습니다."
        actions={<>{f.draft && <DraftBadge note="백엔드 재무 앱이 아직 없어 임시 저장소를 보고 있습니다. 재시작하면 출금 기록이 사라집니다." />}<Button icon={<IconRefresh />} onClick={f.reload} disabled={f.loading}>다시 읽기</Button></>}
      >
        <div className="w-44"><Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="월">{periods.map((p) => <option key={p} value={p}>{monthLabel(p)}</option>)}</Select></div>
      </PageHeader>

      {f.incomeError && <div className="mb-4"><Notice tone="red" title="입금 내역을 읽지 못했습니다">{f.incomeError} 아래 입금·순입금은 0 이 아니라 모름입니다.</Notice></div>}
      {f.expenseError && <div className="mb-4"><Notice tone="red" title="출금 장부를 읽지 못했습니다">{f.expenseError} 아래 출금·순입금은 0 이 아니라 모름입니다.</Notice></div>}
      {!f.loading && !f.expenseError && overdue.length > 0 && (
        <div className="mb-4"><Notice tone="amber" title={`나가기로 한 날이 지났는데 기록이 없는 고정 비용 ${overdue.length}건`}>{overdue.map((d) => d.item.name).join(" · ")} — 이미 냈다면 출금 관리에서 지급을 기록하세요.</Notice></div>
      )}

      {showSkeleton ? <Skeleton rows={5} cols={4} /> : (
        <>
          <div className="sat-stagger grid grid-cols-2 xl:grid-cols-4 gap-2.5 mb-4">
            <Kpi label={`${Number(period.slice(5))}월 입금`} value={f.incomeError ? "-" : won(cur.income)} hint={f.incomeError ? "읽지 못함" : unknownIn ? `금액 미정 ${unknownIn}건 제외 · ${pctText(changePct(cur.income, prev.income))}` : pctText(changePct(cur.income, prev.income))} />
            <Kpi label={`${Number(period.slice(5))}월 출금`} value={f.expenseError ? "-" : won(cur.expense)} hint={f.expenseError ? "읽지 못함" : pctText(changePct(cur.expense, prev.expense))} />
            <Kpi label="순입금" value={f.incomeError || f.expenseError ? "-" : signed(cur.net)} tone={!f.incomeError && !f.expenseError && cur.net > 0 ? "good" : "plain"} hint="입금 − 출금" />
            <Kpi label="남은 예정 출금" value={f.expenseError ? "-" : won(dueSum.amount)} hint={due.length === 0 ? "예정된 고정 비용 없음" : `${due.length}건${dueSum.unknown ? ` · 금액 미입력 ${dueSum.unknown}건` : ""}`} />
          </div>

          <Card className="mb-4" title="최근 6개월" description="막대를 누르면 그 달로 바뀝니다. 입금은 입금한 날, 출금은 돈이 나간 날 기준입니다.">
            <FlowChart rows={series} selected={period} onSelect={setPeriod} />
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4 items-start">
            <Card title={`${Number(period.slice(5))}월 예정 출금`} description="고정 비용 중 이 달에 아직 기록이 없는 것" actions={<Button size="sm" variant="ghost" icon={<IconArrowRight />} onClick={() => onGo?.("finance-expense")}>출금 관리</Button>} flush>
              {due.length === 0 ? (
                <Empty title="이 달 예정된 고정 비용이 없습니다" detail="모두 기록됐거나, 항목이 쉬는 중입니다." />
              ) : (
                <ul>
                  {due.map((d) => (
                    <li key={d.item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-black/[0.05] last:border-0">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-gray-900 truncate">{d.item.name}</p>
                        <p className="text-[12px] text-gray-500 mt-0.5">{d.due_on ? `${Number(d.due_on.slice(5, 7))}/${Number(d.due_on.slice(8))} 지급` : "지급일 미정"}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {d.overdue && <Chip tone="red" dot>미기록</Chip>}
                        {d.item.amount === null ? <Chip tone="amber">금액 미입력</Chip> : <span className="text-[13px] font-semibold tabular-nums text-gray-900">{won(d.item.amount)}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title={`${Number(period.slice(5))}월 출금 분류`} description="가장 큰 항목부터">
              {cats.length === 0 ? <p className="py-6 text-center text-[13px] text-gray-500">이 달 출금 기록이 없습니다.</p> : (
                <ol className="space-y-3">
                  {cats.map((c) => (
                    <li key={c.category}>
                      <div className="flex items-center justify-between text-[12px]"><span className="font-semibold text-gray-700">{c.category} <span className="font-normal text-gray-400">{c.count}건</span></span><span className="tabular-nums text-gray-900 font-semibold">{won(c.amount)}</span></div>
                      <div className="h-1.5 mt-1.5 rounded-full bg-black/[0.06] overflow-hidden"><div className="h-full rounded-full bg-navy/70" style={{ width: `${Math.max(2, Math.round((c.amount / catMax) * 100))}%` }} /></div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          <Card title={`${Number(period.slice(5))}월 최근 거래`} description="입금과 출금을 날짜순으로" flush actions={<div className="flex gap-1.5"><Button size="sm" variant="ghost" onClick={() => onGo?.("finance-income")}>입금 내역</Button><Button size="sm" variant="ghost" onClick={() => onGo?.("finance-expense")}>출금 관리</Button></div>}>
            {recent.length === 0 ? <Empty title="이 달 거래가 없습니다" /> : (
              <ul>
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-black/[0.05] last:border-0">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">{r.name}</p>
                      <p className="text-[12px] text-gray-500 mt-0.5">{Number(r.paid_on.slice(5, 7))}/{Number(r.paid_on.slice(8))} · {r.sub}</p>
                    </div>
                    <span className={`text-[13px] font-semibold tabular-nums shrink-0 ${r.kind === "in" ? "text-emerald-700" : "text-gray-900"}`}>
                      {r.amount === null ? <Chip tone="amber">금액 미정</Chip> : `${r.kind === "in" ? "+" : "−"}${won(r.amount)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
