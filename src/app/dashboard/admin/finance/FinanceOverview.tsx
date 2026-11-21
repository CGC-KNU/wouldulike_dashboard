"use client";

import { useMemo, useState } from "react";
import { IconArrowRight, IconRefresh } from "@tabler/icons-react";
import { addPeriod } from "@/lib/draft/types";
import { BURN_BASIS_LABEL, burnSummary, wonShort, byCategory, changePct, dueRows, dueTotals, latestBalances, monthlySeries, mrrOf, paidStoreCount, periodOf, recentPeriods, reconcile, restrictedLeft, runwayOf, sortByDateDesc, supplyIn, taxIn, unknownIncomeCount, vatPayable, won, type BurnBasis } from "@/lib/finance/calc";
import { INCOME_SOURCE_LABEL } from "@/lib/finance/types";
import { Button, Card, Chip, DraftBadge, Empty, Notice, PageHeader, Segmented, Select, Skeleton, periodLocal, todayLocal } from "../_shared/ui";
import { BalanceCard, FundingCard } from "./CashPanels";
import FlowChart from "./FlowChart";
import { useFinance } from "./useFinance";

/**
 * 재무 · 현황 — 대표 둘이 열면 처음 보는 화면.
 *
 * 위에서 아래로: 런웨이 넷(가용 현금 · 순번 · 런웨이 · MRR) → 그달 장부(입금 · 출금 · 순입금 · 남은 예정 · 부가세 예수금)
 * → 월말 잔고 · 자금 조달 입력 → 6개월 막대 → 예정 출금 · 분류별 출금 → 최근 거래.
 * 런웨이 산식은 설계 보고서(1121 에테르 재무장표) 부록 A 그대로다 — calc.ts 의 burnSummary · runwayOf 등.
 * 모르는 값은 0 이 아니라 「—」이고, 그 자리에 무엇을 넣으면 계산되는지 적는다.
 * 큰 숫자 하나로 끝내지 않고 「막힌 것」(미기록 지급, 금액 미입력)을 같은 화면에서 먼저 보이게 한다.
 * 입금은 Astro 기록을 읽은 것, 출금은 대표가 적은 장부다 — 계좌가 연결돼 있지 않아서다.
 */

const monthLabel = (p: string) => `${p.slice(0, 4)}년 ${Number(p.slice(5))}월`;
const signed = (n: number) => `${n < 0 ? "−" : ""}${won(Math.abs(n))}`;
const signedShort = (n: number) => `${n < 0 ? "−" : ""}${wonShort(Math.abs(n))}`;
const pctText = (p: number | null) => (p === null ? "지난달 기록 없음" : `지난달 대비 ${p > 0 ? "+" : ""}${p}%`);
const RUNWAY_CHIP = { green: { tone: "green", text: "12개월 이상" }, amber: { tone: "amber", text: "6~12개월 · 조달 착수" }, red: { tone: "red", text: "6개월 미만 · 경보" } } as const;
const BASES: BurnBasis[] = [1, 3, 6];

export default function FinanceOverview({ onGo }: { onGo?: (tab: string) => void }) {
  const f = useFinance();
  const thisPeriod = periodLocal();
  const [period, setPeriod] = useState(thisPeriod);
  const today = todayLocal();

  const periods = useMemo(() => recentPeriods(thisPeriod, 12).reverse(), [thisPeriod]);
  const series = useMemo(() => monthlySeries(f.income, f.entries, recentPeriods(period, 6)), [f.income, f.entries, period]);
  const cur = series[series.length - 1];
  const prev = series[series.length - 2];
  const paidCount = paidStoreCount(f.paidStores, period);
  const due = useMemo(() => dueRows(f.items, f.entries, period, today, paidCount), [f.items, f.entries, period, today, paidCount]);
  const dueSum = useMemo(() => dueTotals(due), [due]);
  const cats = useMemo(() => byCategory(f.entries, period), [f.entries, period]);
  const catMax = Math.max(1, ...cats.map((c) => c.amount));
  const unknownIn = unknownIncomeCount(f.income, period);
  const overdue = due.filter((d) => d.overdue);

  // ── 런웨이 넷 ── 순번은 마감월로 센다: 이번 달은 아직 안 닫혔으니 지난달까지.
  const [basis, setBasis] = useState<BurnBasis>(3);
  const closed = period < thisPeriod ? period : addPeriod(thisPeriod, -1);
  const ledgerOk = !f.incomeError && !f.expenseError;
  const burn = useMemo(() => burnSummary(f.income, f.entries, f.items, closed, basis), [f.income, f.entries, f.items, closed, basis]);
  const snap = useMemo(() => (f.cashError ? null : latestBalances(f.balances, period)), [f.balances, f.cashError, period]);
  const vatAt = vatPayable(f.income, snap?.period ?? period);
  const restricted = snap ? restrictedLeft(f.fundings, snap.period) : 0;
  const available = snap && !f.incomeError ? snap.total - vatAt.amount - restricted : null;
  const rec = snap && ledgerOk ? reconcile(snap, f.balances, f.income, f.entries, f.fundings) : null;
  const net = ledgerOk ? burn.net : null;
  const runway = available !== null && net !== null && snap ? runwayOf(available, net, snap.period) : null;
  const mrr = f.incomeError ? null : mrrOf(f.billing, period);
  const arpa = mrr !== null && paidCount ? Math.round(mrr / paidCount) : null;
  const spotSupply = supplyIn(f.income.filter((i) => i.source === "spot"), period);
  const vat = vatPayable(f.income, period);
  const curSupply = supplyIn(f.income, period);
  const curTax = taxIn(f.income, period);
  const prevPeriod = addPeriod(period, -1);
  const prevSupply = supplyIn(f.income, prevPeriod);
  const prevTax = taxIn(f.income, prevPeriod);
  const runwayMissing = f.cashError ? "잔고를 읽지 못했습니다" : !snap ? "월말 잔고를 입력하면 계산합니다" : !ledgerOk ? "장부를 읽지 못했습니다" : "출금을 기록하면 계산합니다";

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
        description="들어온 돈은 Astro 기록에서, 나간 돈 · 잔고 · 조달은 직접 적은 장부에서 가져옵니다. 대표만 볼 수 있습니다."
        actions={<>{f.draft && <DraftBadge note="백엔드 재무 원장이 아직 없어 임시 저장소를 보고 있습니다. 재시작하면 출금 · 잔고 · 조달 기록이 사라집니다." />}<Button icon={<IconRefresh />} onClick={f.reload} disabled={f.loading}>다시 읽기</Button></>}
      >
        <div className="w-44"><Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="월">{periods.map((p) => <option key={p} value={p}>{monthLabel(p)}</option>)}</Select></div>
      </PageHeader>

      {f.incomeError && <div className="mb-4"><Notice tone="red" title="입금 내역을 읽지 못했습니다">{f.incomeError} 아래 입금·순입금은 0 이 아니라 모름입니다.</Notice></div>}
      {f.expenseError && <div className="mb-4"><Notice tone="red" title="출금 장부를 읽지 못했습니다">{f.expenseError} 아래 출금·순입금은 0 이 아니라 모름입니다.</Notice></div>}
      {f.cashError && <div className="mb-4"><Notice tone="red" title="월말 잔고 · 자금 조달을 읽지 못했습니다">{f.cashError} 가용 현금 · 런웨이는 0 이 아니라 모름입니다.</Notice></div>}
      {/* 확인할 것 — 큰 경고 상자 여러 개 대신 한 줄씩 (1122 가독성) */}
      {!f.loading && (rec?.state === "need" || (!f.expenseError && overdue.length > 0)) && (
        <div className="mb-4 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-2.5 space-y-1">
          {rec?.state === "need" && <p className="text-[13px] text-amber-900"><b>대사 필요</b> · {Number(snap!.period.slice(5))}월 말 잔고가 장부와 {won(Math.abs(rec.diff))} 다릅니다 — 장부에 안 적힌 입출금 확인</p>}
          {!f.expenseError && overdue.length > 0 && <p className="text-[13px] text-amber-900"><b>지급 미기록 {overdue.length}건</b> · {overdue.map((d) => d.item.name).join(" · ")} — 냈다면 <button type="button" className="underline font-semibold" onClick={() => onGo?.("finance-expense")}>출금 관리</button>에서 기록</p>}
        </div>
      )}

      {showSkeleton ? <Skeleton rows={5} cols={4} /> : (
        <>
          {/* ① 런웨이 — 카드 넷을 한 판으로. 큰 숫자는 만 단위, 정확한 값은 마우스를 올리면 */}
          <section className="mb-5 rounded-[20px] overflow-hidden border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_40px_-28px_rgba(5,0,114,0.35)]">
            <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
              <div>
                <h2 className="text-[16px] font-bold text-gray-900 tracking-[-0.01em]">런웨이</h2>
                <p className="text-[12px] text-gray-500">통장 기준 · 조달 제외 · {Number(closed.slice(5))}월까지 마감된 달로 계산</p>
              </div>
              <Segmented<"1" | "3" | "6"> label="순번 기준" value={String(basis) as "1" | "3" | "6"} onChange={(v) => setBasis(Number(v) as BurnBasis)} options={BASES.map((b) => ({ key: String(b) as "1" | "3" | "6", label: BURN_BASIS_LABEL[b] }))} />
            </header>
            <div className="grid grid-cols-2 xl:grid-cols-4 border-t border-black/[0.06] divide-x divide-black/[0.06] [&>*:nth-child(n+3)]:border-t xl:[&>*:nth-child(n+3)]:border-t-0">
              <Metric label={snap ? `가용 현금 · ${Number(snap.period.slice(5))}월 말` : "가용 현금"}
                value={available === null ? null : signedShort(available)} full={available === null ? undefined : signed(available)}
                sub={available === null ? undefined : `통장 ${wonShort(snap!.total)} − 부가세 ${wonShort(vatAt.amount)} − 전용 ${wonShort(restricted)}`}
                chip={available === null ? undefined : rec?.state === "need" ? <Chip tone="red" dot>대사 필요</Chip> : rec?.state === "ok" ? <Chip tone="green">장부와 맞음</Chip> : <Chip tone="gray">대사 전</Chip>}
                empty={f.cashError ? "잔고를 읽지 못했습니다" : !snap ? "월말 잔고가 없습니다" : "입금 내역을 읽지 못했습니다"}
                cta={!snap && !f.cashError ? { label: "잔고 입력", onClick: () => document.getElementById("cash-panels")?.scrollIntoView({ behavior: "smooth", block: "start" }) } : undefined} />
              <Metric label={`순번 · ${BURN_BASIS_LABEL[basis]}`} value={net === null ? null : signedShort(net)} full={net === null ? undefined : signed(net)}
                sub={net === null ? undefined : `총번 ${wonShort(burn.gross ?? 0)} · 운영 번 ${signedShort(burn.operating ?? 0)}`}
                note={net !== null && burn.months.length < basis ? `기록 있는 ${burn.months.length}개월로 계산` : undefined}
                empty={ledgerOk ? `${Number(closed.slice(5))}월 출금 기록이 없습니다` : "장부를 읽지 못했습니다"}
                cta={ledgerOk && net === null ? { label: "출금 기록", onClick: () => onGo?.("finance-expense") } : undefined} />
              {runway && runway.surplus ? (
                <Metric label="런웨이" value="흑자" tone="good" sub="순번 0 이하 — 해당 없음" />
              ) : (
                <Metric label="런웨이" value={runway ? `${runway.months.toFixed(1)}개월` : null}
                  tone={runway ? (runway.tone === "green" ? "good" : runway.tone === "red" ? "bad" : "warn") : undefined}
                  sub={runway ? `${runway.zeroMonth.slice(0, 4)}년 ${Number(runway.zeroMonth.slice(5))}월 소진 예상` : undefined}
                  chip={runway ? <Chip tone={RUNWAY_CHIP[runway.tone].tone} dot>{RUNWAY_CHIP[runway.tone].text}</Chip> : undefined}
                  empty={runwayMissing} />
              )}
              <Metric label={`구독 MRR · ${Number(period.slice(5))}월`} value={mrr === null ? null : wonShort(mrr)} full={mrr === null ? undefined : won(mrr)}
                sub={mrr === null ? undefined : `유료 ${paidCount ?? "—"}곳 · ARPA ${arpa === null ? "—" : wonShort(arpa)}`}
                note={mrr === null ? undefined : spotSupply ? `스팟 ${wonShort(spotSupply)} 별도` : undefined}
                empty={mrr === null ? "입금 내역을 읽지 못했습니다" : ""} />
            </div>
          </section>

          {/* ② 그달 장부 — 카드 다섯 대신 재무장표처럼 한 표로: 이 달 · 지난달 · 증감 */}
          <Card className="mb-5" flush title={`${Number(period.slice(5))}월 장부`} description="현금 기준 · 매출은 공급가, 세액은 부가세 예수금으로 따로">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13.5px]">
                <thead>
                  <tr className="text-[11.5px] text-gray-500 border-b border-black/[0.06]">
                    <th scope="col" className="text-left font-semibold px-5 py-2">항목</th>
                    <th scope="col" className="text-right font-semibold px-3 py-2">{Number(period.slice(5))}월</th>
                    <th scope="col" className="text-right font-semibold px-3 py-2">{Number(prevPeriod.slice(5))}월</th>
                    <th scope="col" className="text-right font-semibold px-5 py-2">증감</th>
                  </tr>
                </thead>
                <tbody className="[&>tr]:border-b [&>tr]:border-black/[0.05]">
                  <Row label="매출 (공급가)" now={f.incomeError ? null : curSupply} prev={f.incomeError ? null : prevSupply} note={unknownIn ? `금액 미정 ${unknownIn}건 제외` : undefined} />
                  <Row label="부가세 (받은 세액)" now={f.incomeError ? null : curTax} prev={f.incomeError ? null : prevTax} muted />
                  <Row label="출금" now={f.expenseError ? null : cur.expense} prev={f.expenseError ? null : prev.expense} minus />
                  <Row label="순입금 (통장 입금 − 출금)" now={ledgerOk ? cur.net : null} prev={ledgerOk ? prev.net : null} strong />
                  <tr className="!border-b-0 bg-black/[0.03]">
                    <td className="px-5 py-2.5 text-gray-700">남은 예정 출금 <span className="text-[11.5px] text-gray-400">{due.length ? `${due.length}건${dueSum.unknown ? ` · 금액 미입력 ${dueSum.unknown}` : ""}` : "없음"}</span></td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-900">{f.expenseError ? "—" : won(dueSum.amount)}</td>
                    <td colSpan={2} className="px-5 py-2.5 text-right text-[12px] text-gray-500">부가세 예수금 <b className="text-gray-800 tabular-nums">{f.incomeError ? "—" : won(vat.amount)}</b> · 납부 {Number(vat.due.slice(5, 7))}/{Number(vat.due.slice(8))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <div id="cash-panels" className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5 items-start scroll-mt-20">
            <BalanceCard f={f} snap={snap} rec={rec} />
            <FundingCard f={f} />
          </div>

          <Card className="mb-4" title="최근 6개월" description="막대를 누르면 그 달로 바뀝니다. 입금은 입금한 날, 출금은 돈이 나간 날 기준입니다.">
            <FlowChart rows={series} selected={period} onSelect={setPeriod} />
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4 items-start">
            <Card title={`${Number(period.slice(5))}월 예정 출금`} description="반복 항목 중 이 달에 아직 기록이 없는 것" actions={<Button size="sm" variant="ghost" icon={<IconArrowRight />} onClick={() => onGo?.("finance-expense")}>출금 관리</Button>} flush>
              {due.length === 0 ? (
                <Empty title="이 달 예정된 반복 항목이 없습니다" detail="모두 기록됐거나, 항목이 쉬는 중입니다." />
              ) : (
                <ul>
                  {due.map((d) => (
                    <li key={d.item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-black/[0.05] last:border-0">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-gray-900 truncate">{d.item.name}</p>
                        <p className="text-[12px] text-gray-500 mt-0.5">{d.due_on ? `${Number(d.due_on.slice(5, 7))}/${Number(d.due_on.slice(8))} 지급` : "지급일 미정"}{d.item.method === "PER_PAID_STORE" && (d.count !== null && d.item.amount !== null ? ` · 곳당 ${won(d.item.amount)} × 유료 ${d.count}곳` : " · 유료 식당 수 × 단가")}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {d.overdue && <Chip tone="red" dot>미기록</Chip>}
                        {d.amount === null ? <Chip tone="amber">{d.item.amount === null ? "금액 미입력" : "식당 수 못 읽음"}</Chip> : <span className="text-[13px] font-semibold tabular-nums text-gray-900">{won(d.amount)}</span>}
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

/** 런웨이 판 한 칸 — 값이 없으면 큰 「—」 대신 무엇이 없는지 한 줄 + 버튼 */
function Metric({ label, value, full, sub, note, chip, tone, empty, cta }: {
  label: string; value: string | null; full?: string; sub?: string; note?: string; chip?: React.ReactNode;
  tone?: "good" | "warn" | "bad"; empty?: string; cta?: { label: string; onClick: () => void };
}) {
  const color = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-gray-900";
  return (
    <div className="px-5 py-4 min-w-0">
      <p className="text-[12px] font-semibold text-gray-500 truncate">{label}</p>
      {value === null ? (
        <div className="mt-2">
          <p className="text-[13px] text-gray-400">{empty}</p>
          {cta && <button type="button" onClick={cta.onClick} className="mt-1.5 text-[12.5px] font-semibold text-navy hover:underline">{cta.label} →</button>}
        </div>
      ) : (
        <>
          <p className={`mt-1 text-[26px] font-bold tabular-nums tracking-[-0.02em] leading-tight whitespace-nowrap ${color}`} title={full}>{value}</p>
          {sub && <p className="mt-1 text-[12px] text-gray-500 truncate" title={sub}>{sub}</p>}
          {note && <p className="text-[11.5px] text-gray-400 truncate">{note}</p>}
          {chip && <div className="mt-2">{chip}</div>}
        </>
      )}
    </div>
  );
}

/** 장부 표 한 줄 — 이 달 · 지난달 · 증감. 모르는 값은 「—」 */
function Row({ label, now, prev, note, minus, strong, muted }: { label: string; now: number | null; prev: number | null; note?: string; minus?: boolean; strong?: boolean; muted?: boolean }) {
  const diff = now !== null && prev !== null ? now - prev : null;
  const fmt = (n: number | null) => (n === null ? "—" : `${minus && n ? "−" : n < 0 ? "−" : ""}${won(Math.abs(n))}`);
  return (
    <tr className={strong ? "bg-navy/[0.04]" : ""}>
      <td className={`px-5 py-2.5 ${strong ? "font-bold text-gray-900" : muted ? "text-gray-500" : "text-gray-800"}`}>{label}{note && <span className="ml-1.5 text-[11.5px] text-gray-400">{note}</span>}</td>
      <td className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${strong ? "font-bold text-gray-900" : muted ? "text-gray-500" : "font-semibold text-gray-900"}`}>{fmt(now)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-gray-500">{fmt(prev)}</td>
      <td className={`px-5 py-2.5 text-right tabular-nums whitespace-nowrap text-[12.5px] ${diff === null || diff === 0 ? "text-gray-400" : (minus ? diff < 0 : diff > 0) ? "text-emerald-600" : "text-red-600"}`}>
        {diff === null ? "—" : diff === 0 ? "0" : `${diff > 0 ? "+" : "−"}${won(Math.abs(diff)).replace("원", "")}`}
      </td>
    </tr>
  );
}
