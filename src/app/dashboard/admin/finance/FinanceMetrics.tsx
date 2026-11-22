"use client";

import { useMemo, useState } from "react";
import { addPeriod } from "@/lib/draft/types";
import { recentPeriods, won, wonShort } from "@/lib/finance/calc";
import { budgetVsActual, cacOf, campusRows, conversionRate, defaultAlive, funnelOf, marketRecount, newPaidCount, nextMilestone, nrrOf, onboardingCost, paybackMonths, RAISE_LEAD_MONTHS, retention3, unitEconomics, vatNet, type BvaTone } from "@/lib/finance/metrics";
import { CAMPUSES, type MarketFigure } from "@/lib/finance/types";
import { Button, Chip, Input } from "../_shared/ui";
import type { FinanceData } from "./useFinance";

/**
 * 재무 현황 · 지표 20개(1122 민열님 선택) — 카드를 늘어놓지 않고 네 묶음으로.
 *   ① 매장 1곳 단위 — 매달(ARPA − 변동비 = 공헌이익 → 손익분기) 한 줄 + 데려올 때(입점 비용 · CAC · 회수기간) 한 줄
 *   ② 성장 · 유지 — 표 한 장
 *   ③ 현금 · 계획 — 표 한 장 + 계획 대비 실적 표
 *   ④ 시장 · 상권 — 상권 표 + TAM · SAM · SOM 한 줄
 * 산식은 lib/finance/metrics.ts. 값을 모르면 0 이 아니라 「—」 + 무엇을 기록하면 나오는지 한 줄.
 * 기록 칸이 아직 없거나 막 생긴 지표는 자리를 두고 「기록 시작 필요」를 붙인다.
 */

const pct = (r: number | null, d = 0) => (r === null ? null : `${(r * 100).toFixed(d)}%`);
const mlabel = (p: string) => `${p.slice(2, 4)}년 ${Number(p.slice(5))}월`;
const monthsText = (n: number | null) => (n === null ? null : `${n.toFixed(1)}개월`);
type State = "ok" | "input" | "start";
const STATE_CHIP: Record<Exclude<State, "ok">, { tone: "amber" | "gray"; text: string }> = { input: { tone: "amber", text: "입력 필요" }, start: { tone: "gray", text: "기록 시작 필요" } };
const BVA_COLOR: Record<BvaTone, string> = { small: "text-gray-400", ok: "text-gray-600", amber: "text-amber-600", red: "text-red-600" };

export default function FinanceMetrics({ f, period, closed, thisPeriod, runway, grossBurn, onGo }: {
  f: FinanceData; period: string; closed: string; thisPeriod: string;
  runway: { surplus: true } | { surplus: false; months: number; zeroMonth: string } | null;
  grossBurn: number | null; onGo?: (tab: string) => void;
}) {
  const m = f.metrics;
  const rec = m?.records ?? null;
  const months = useMemo(() => recentPeriods(closed, 3), [closed]);
  const span = `${Number(months[0].slice(5))}~${Number(closed.slice(5))}월`;
  const ledgerOk = !f.incomeError && !f.expenseError;

  const ue = useMemo(() => unitEconomics(f.billing, f.items, f.entries, f.paidStores, months), [f.billing, f.items, f.entries, f.paidStores, months]);
  const churn = rec?.churn ?? [];
  const newPaid = newPaidCount(f.paidStores, churn, months);
  const onb = onboardingCost(f.entries, months, newPaid);
  const cac = cacOf(f.entries, f.items, rec?.sales_minutes ?? {}, rec?.sales_since ?? null, rec?.settings.hour_rate ?? 10_000, months, newPaid);
  const payback = paybackMonths(cac.cac, ue.arpa, ue.grossMargin);

  const ret = retention3(f.paidStores, churn, closed);
  const conv = conversionRate(rec?.plan_history ?? [], m?.free ? m.free.length : null, months);
  const nrr = nrrOf(f.billing, closed, 3);
  const funnel = funnelOf(m?.funnel ?? null);

  const ms = nextMilestone(m?.goals ?? null, thisPeriod);
  const zero = runway && !runway.surplus ? runway.zeroMonth : null;
  const deadline = zero ? addPeriod(zero, -RAISE_LEAD_MONTHS) : null;
  const alive = defaultAlive(f.billing, closed, ledgerOk ? grossBurn : null, runway === null ? null : runway.surplus ? "surplus" : runway.months);
  const bva = budgetVsActual(rec?.plan ?? null, f.income, f.entries, f.items, period);
  const vat = vatNet(f.income, f.entries, period);

  const camp = campusRows(f.paidStores, m?.free ?? null, m?.hubble ?? null, f.entries, ue.contribution, CAMPUSES);
  const market = rec?.market ?? null;
  const recount = marketRecount(market, m?.hubble ?? null);

  const noRecords = !rec;
  const recNote = noRecords ? "재무 기록을 읽지 못했습니다(백엔드)" : null;

  return (
    <div className="space-y-5 mb-5">
      {/* ① 매장 1곳 단위 */}
      <Section title="매장 1곳 단위" sub={`마감된 ${span} 합산 · 유료 매장-월 ${ue.storeMonths}`}>
        <p className="px-5 pt-3 text-[11.5px] font-semibold text-gray-500">매달</p>
        <Board>
          <Cell no={1} label="ARPA · 매장당 월 매출" value={ue.arpa === null ? null : won(ue.arpa)} sub="MRR ÷ 유료 매장" empty={f.paidStores === null ? "유료 매장 수를 읽지 못했습니다" : ue.storeMonths ? "이 기간 구독 청구가 없습니다" : "이 기간 유료 매장이 없습니다"} />
          <Cell no={2} label="매장당 월 변동비" value={ue.variablePerStore === null ? null : won(ue.variablePerStore)} sub="변동 항목 비용 ÷ 유료 매장" note={ue.variableUnknown ? `금액 미입력 ${ue.variableUnknown}건 제외` : undefined}
            state={ue.variableUnknown ? "input" : "ok"} empty={f.paidStores === null ? "유료 매장 수를 읽지 못했습니다" : "행동 방식 「변동」 항목이 이 기간에 없습니다"} />
          <Cell no={3} label="매장당 공헌이익" value={ue.contribution === null ? null : won(ue.contribution)} tone={ue.contribution !== null && ue.contribution < 0 ? "bad" : undefined} sub="ARPA − 변동비" empty="ARPA · 변동비가 있어야 합니다" />
          <Cell no={7} label="손익분기 유료 매장" value={ue.breakEven === null ? null : `${ue.breakEven}곳`} sub={ue.fixed === null ? undefined : `월 고정비 ${wonShort(ue.fixed)} ÷ 공헌이익`} note={ue.fixedUnknown ? `고정 항목 금액 미입력 ${ue.fixedUnknown}건` : f.paidStores ? `지금 유료 ${f.paidStores.length}곳` : undefined}
            state={ue.fixed === null || ue.fixedUnknown ? "input" : "ok"} empty={ue.fixed === null ? "출금 · 고정 항목 금액을 적으면 나옵니다" : "공헌이익이 0 이하라 못 냅니다"} />
        </Board>
        <p className="px-5 pt-3 text-[11.5px] font-semibold text-gray-500 border-t border-black/[0.06]">데려올 때 · 신규 유료 {newPaid ?? "—"}곳</p>
        <Board cols={3}>
          <Cell no={4} label="매장당 입점 비용 · 일회성" value={onb.perStore === null ? null : won(onb.perStore)} sub={onb.started ? `입점 태그 출금 ${wonShort(onb.total)} ÷ 신규 유료` : undefined}
            state={onb.started ? "ok" : "start"} empty={!onb.started ? "출금에 「입점」 태그를 달면 나옵니다" : "이 기간 신규 유료가 없습니다"} />
          <Cell no={5} label="매장당 CAC" value={cac.cac === null ? null : won(cac.cac)} sub={cac.started ? `영업 ${Math.round(cac.minutes / 60)}시간 ${wonShort(cac.people)} + S&M ${wonShort(cac.sm)}` : undefined}
            note={<HourRate f={f} rate={rec?.settings.hour_rate ?? null} />}
            state={cac.started ? "ok" : "start"} empty={noRecords ? recNote! : !cac.started ? "후보 활동 기록에 「쓴 시간(분)」을 적으면 나옵니다" : "이 기간 신규 유료가 없습니다"} />
          <Cell no={6} label="CAC 회수기간" value={monthsText(payback)} tone={payback !== null ? (payback <= 12 ? "good" : "warn") : undefined}
            sub={payback === null ? undefined : `CAC ÷ (ARPA × 매출총이익률 ${pct(ue.grossMargin)})`} note={payback !== null ? "12개월 안이면 건강" : undefined}
            state={cac.started && ue.grossMargin !== null ? "ok" : cac.started ? "input" : "start"} empty={ue.grossMargin === null ? "COGS 항목 지급을 기록하면 매출총이익률이 나옵니다" : "CAC 가 있어야 합니다"} />
        </Board>
      </Section>

      {/* ② 성장 · 유지 */}
      <Section title="성장 · 유지" sub={`마감월 ${Number(closed.slice(5))}월 기준`}>
        <Lines>
          <Line no={8} label="3개월 유지율" value={pct(ret.rate)} tone={ret.rate !== null ? (ret.rate >= 0.8 ? "good" : "warn") : undefined}
            basis={ret.rate === null ? undefined : `${mlabel(ret.from)}~${mlabel(ret.to)} 시작 ${ret.started}곳 중 ${ret.retained}곳 · 목표 80%+`}
            state={churn.length ? "ok" : "start"} hint={churn.length ? undefined : "계약 종료 때 사유를 고르면 해지가 쌓입니다 — 지금은 해지 0건으로 셈"}
            empty={f.paidStores === null ? "유료 매장을 읽지 못했습니다" : "이 기간 유료 시작 월이 적힌 매장이 없습니다(운영값 청구 시작 월)"} />
          <Line no={9} label="무료 → 유료 전환율" value={pct(conv.rate)} basis={conv.rate === null ? undefined : `${span} 전환 ${conv.converted}곳 ÷ (무료 ${m?.free?.length ?? "—"} + 전환)`}
            state={conv.started ? "ok" : "start"} hint={conv.since ? `플랜 변경 기록 ${conv.since}부터` : undefined}
            empty={noRecords ? recNote! : !conv.started ? "플랜 변경 기록이 오늘부터 쌓입니다 — 첫 변경 뒤에 나옵니다" : "무료 매장 수를 읽지 못했습니다"} />
          <Line no={10} label="NRR · 순매출 유지" value={pct(nrr.rate)} tone={nrr.rate !== null ? (nrr.rate >= 1 ? "good" : "warn") : undefined}
            basis={nrr.rate === null ? undefined : `${Number(nrr.base.slice(5))}월 구독 매장 ${nrr.cohort}곳의 ${Number(closed.slice(5))}월 MRR ÷ 그때 MRR`} hint="방학 0원 달은 줄어 보입니다"
            empty={f.incomeError ? "입금 내역을 읽지 못했습니다" : `${Number(nrr.base.slice(5))}월 구독 청구가 없습니다`} />
          <Line no={11} label="영업 깔때기 전환율" value={funnel?.rate == null ? null : pct(funnel.rate, 1)}
            basis={funnel?.rate == null ? undefined : `계약 완료 ${funnel.contracted} ÷ 컨택 ${funnel.contacted} · ${funnel.perDeal!.toFixed(1)}곳 만나 1곳`} hint="7일 넘게 멈춘 후보도 분모에 들어갑니다"
            empty={funnel === null ? "후보 목록을 읽지 못했습니다" : "컨택한 후보가 없습니다"} />
        </Lines>
      </Section>

      {/* ③ 현금 · 계획 */}
      <Section title="현금 · 계획" sub="런웨이 소진월 · 학기 목표 · 런웨이 모델 계획값">
        <Lines>
          <Line no={12} label="소진월 vs 마일스톤" value={zero ? mlabel(zero) : runway?.surplus ? "흑자" : null}
            tone={zero && ms ? (zero > ms.period ? "good" : "bad") : undefined}
            basis={zero ? `${ms ? `다음 마일스톤 ${ms.label}(${mlabel(ms.period)}) ${zero > ms.period ? "뒤에" : "전에"} 소진` : "목표 표를 읽지 못했습니다"} · 조달 착수 마감선 ${mlabel(deadline!)}` : undefined}
            chip={deadline && deadline <= thisPeriod ? <Chip tone="red" dot>착수 마감 지남</Chip> : undefined}
            empty="런웨이가 나와야 합니다(월말 잔고 · 출금)" />
          <Line no={13} label="Default alive" value={alive.alive === null ? null : alive.alive ? "예" : "아니오"} tone={alive.alive === null ? undefined : alive.alive ? "good" : "bad"}
            basis={alive.growth === null && alive.profitMonth === null ? undefined : `MRR 월 ${alive.growth === null ? "—" : `${(alive.growth * 100).toFixed(1)}%`} 성장 유지 시 흑자 ${alive.profitMonth ? mlabel(alive.profitMonth) : "60개월 안에 없음"}`}
            empty={!ledgerOk ? "장부를 읽지 못했습니다" : grossBurn === null ? "출금을 기록하면 나옵니다" : "런웨이가 나와야 합니다(월말 잔고)"} />
          <Line no={15} label="부가세 순납부액 · 매입공제 후" value={f.incomeError || f.expenseError ? null : won(vat.net)}
            basis={`받은 세액 ${wonShort(vat.out)} − 매입 세액 ${wonShort(vat.input)} · 납부 ${Number(vat.due.slice(5, 7))}/${Number(vat.due.slice(8))}`}
            state={vat.recorded ? (vat.missing ? "input" : "ok") : "start"} hint={vat.missing ? `세액 안 적은 출금 ${vat.missing}건 — 적으면 줄어듭니다` : undefined}
            empty="장부를 읽지 못했습니다" />
        </Lines>
        <div className="border-t border-black/[0.06]">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-3 pb-1">
            <p className="text-[13px] font-semibold text-gray-800"><span className="text-gray-400 tabular-nums mr-1.5">14</span>계획 대비 실적 · {Number(period.slice(5))}월</p>
            <p className="text-[11.5px] text-gray-500 truncate">{rec?.plan ? `런웨이 모델 ${rec.plan.version ?? ""} ${rec.plan.scenario ?? ""}`.trim() : ""} · ±10% 노랑 · ±20% 빨강 · 10만 원 미만 무시</p>
          </div>
          {!rec?.plan ? (
            <Empty line={noRecords ? recNote! : "계획값이 없습니다 — 런웨이 모델 v3.6 월별 계획을 올리면 나옵니다"} state="input" />
          ) : !bva.planned ? (
            <Empty line={`이 달 계획값이 없습니다${bva.first ? ` — 계획은 ${mlabel(bva.first)}부터` : ""}`} />
          ) : (
            <div className="overflow-x-auto pb-2">
              <table className="w-full min-w-[480px] text-[13px]">
                <thead><tr className="text-[11.5px] text-gray-500 border-b border-black/[0.06]"><th scope="col" className="text-left font-semibold px-5 py-1.5">계정</th><th scope="col" className="text-right font-semibold px-3 py-1.5">계획</th><th scope="col" className="text-right font-semibold px-3 py-1.5">실적</th><th scope="col" className="text-right font-semibold px-5 py-1.5">차이</th></tr></thead>
                <tbody className="[&>tr]:border-b [&>tr]:border-black/[0.05]">
                  {bva.rows.map((r) => (
                    <tr key={r.key}>
                      <td className="px-5 py-2 text-gray-800">{r.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-gray-500">{r.plan === null ? "—" : won(r.plan)}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold text-gray-900">{won(r.actual)}</td>
                      <td className={`px-5 py-2 text-right tabular-nums whitespace-nowrap text-[12.5px] ${BVA_COLOR[r.tone]}`}>{r.diff === null ? "—" : `${r.diff > 0 ? "+" : r.diff < 0 ? "−" : ""}${wonShort(Math.abs(r.diff))}${r.pct === null ? "" : ` · ${r.pct > 0 ? "+" : ""}${Math.round(r.pct * 100)}%`}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      {/* ④ 시장 · 상권 */}
      <Section title="시장 · 상권" sub="침투율 = 매장 ÷ 허블 상권 1km 식당 · 진입 비용 = 「상권 진입」 태그 출금 누적">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-[11.5px] text-gray-500 border-b border-black/[0.06]">
                <th scope="col" className="text-left font-semibold px-5 py-2">상권</th>
                <th scope="col" className="text-right font-semibold px-3 py-2">1km 식당</th>
                <th scope="col" className="text-right font-semibold px-3 py-2"><span className="text-gray-400 mr-1">16</span>유료 침투율</th>
                <th scope="col" className="text-right font-semibold px-3 py-2">파트너 침투율</th>
                <th scope="col" className="text-right font-semibold px-3 py-2"><span className="text-gray-400 mr-1">20</span>진입 비용</th>
                <th scope="col" className="text-right font-semibold px-5 py-2">회수기간</th>
              </tr>
            </thead>
            <tbody className="[&>tr]:border-b [&>tr]:border-black/[0.05]">
              {camp.map((c) => (
                <tr key={c.campus}>
                  <td className="px-5 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{c.campus}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-gray-600">{c.restaurants === null ? "—" : c.restaurants.toLocaleString("ko-KR")}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap font-semibold text-gray-900">{c.paidRate === null ? "—" : `${pct(c.paidRate, 1)}`}<span className="ml-1 text-[11.5px] font-normal text-gray-400">{c.paid}곳</span></td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-gray-700">{c.partnerRate === null ? "—" : pct(c.partnerRate, 1)}<span className="ml-1 text-[11.5px] text-gray-400">{c.partners}곳</span></td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-gray-700">{c.entryCost ? won(c.entryCost) : "—"}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums whitespace-nowrap text-gray-700">{monthsText(c.entryPayback) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-2 text-[11.5px] text-gray-400">
          {!m?.hubble ? "허블 상권 문서를 읽지 못해 식당 수가 비었습니다. " : ""}
          {f.entries.some((e) => e.tag === "campus") ? "회수기간 = 진입 비용 ÷ (그 상권 유료 × 매장당 공헌이익)" : "진입 비용은 출금에 「상권 진입」 태그를 달면 쌓입니다 — 기록 시작 필요"}
        </p>
        <Board cols={3}>
          <MarketCell no={17} label="TAM · 전체 시장" fig={market?.tam} recount={recount.tam} recountNote={m?.hubble ? `허블 ${m.hubble.count}개 상권 ${m.hubble.total.toLocaleString("ko-KR")}곳 × Boost 연간` : undefined} missing={noRecords ? recNote! : "시장 규모를 올리면 나옵니다"} />
          <MarketCell no={18} label="SAM · 갈 수 있는 시장" fig={market?.sam} recount={recount.sam} recountNote={recount.samRestaurants !== null ? `권역 식당 ${recount.samRestaurants.toLocaleString("ko-KR")}곳 × Boost 연간` : undefined} missing={noRecords ? recNote! : "시장 규모를 올리면 나옵니다"} />
          <MarketCell no={19} label="SOM · 가져올 몫" fig={market?.som} missing={noRecords ? recNote! : "시장 규모를 올리면 나옵니다"} />
        </Board>
      </Section>
      {onGo && <p className="text-[12px] text-gray-500 -mt-2">용어 뜻은 <button type="button" className="text-navy font-medium hover:underline" onClick={() => onGo("finance-glossary")}>용어 정리</button>에 있습니다.</p>}
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] overflow-hidden border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_40px_-28px_rgba(5,0,114,0.35)]">
      <header className="px-5 pt-4 pb-3 border-b border-black/[0.06]">
        <h2 className="text-[16px] font-bold text-gray-900 tracking-[-0.01em]">{title}</h2>
        <p className="text-[12px] text-gray-500">{sub}</p>
      </header>
      {children}
    </section>
  );
}

/** 한 판에 칸 나눔 — 런웨이 판과 같은 모양 */
function Board({ children, cols = 4 }: { children: React.ReactNode; cols?: 3 | 4 }) {
  return <div className={`grid grid-cols-1 sm:grid-cols-2 ${cols === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"} divide-y sm:divide-y-0 divide-black/[0.05] [&>*]:border-black/[0.06] xl:[&>*+*]:border-l`}>{children}</div>;
}

const TONE = { good: "text-emerald-600", warn: "text-amber-600", bad: "text-red-600" } as const;

function Cell({ no, label, value, sub, note, tone, state = "ok", empty }: {
  no: number; label: string; value: string | null; sub?: string; note?: React.ReactNode; tone?: keyof typeof TONE; state?: State; empty: string;
}) {
  return (
    <div className="px-5 py-3.5 min-w-0">
      <p className="text-[12px] font-semibold text-gray-500 truncate"><span className="text-gray-400 tabular-nums mr-1.5">{no}</span>{label}</p>
      {value === null ? <p className="mt-1.5 text-[12.5px] text-gray-400">— {empty}</p> : (
        <>
          <p className={`mt-0.5 text-[22px] font-bold tabular-nums tracking-[-0.02em] leading-tight whitespace-nowrap ${tone ? TONE[tone] : "text-gray-900"}`}>{value}</p>
          {sub && <p className="mt-0.5 text-[11.5px] text-gray-500 truncate" title={sub}>{sub}</p>}
        </>
      )}
      {note && <div className="text-[11.5px] text-gray-400 truncate">{note}</div>}
      {state !== "ok" && <div className="mt-1.5"><Chip tone={STATE_CHIP[state].tone}>{STATE_CHIP[state].text}</Chip></div>}
    </div>
  );
}

function Lines({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-black/[0.05]">{children}</ul>;
}

/** 표 한 줄 — 번호 · 지표 | 값 | 근거. 값이 없으면 「—」 + 무엇을 기록하면 나오는지 */
function Line({ no, label, value, basis, hint, chip, tone, state = "ok", empty }: {
  no: number; label: string; value: string | null; basis?: string; hint?: string; chip?: React.ReactNode; tone?: keyof typeof TONE; state?: State; empty: string;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,13rem)_7.5rem_minmax(0,1fr)] max-md:grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 px-5 py-2.5">
      <p className="text-[13px] font-semibold text-gray-800 truncate"><span className="text-gray-400 tabular-nums mr-1.5">{no}</span>{label}</p>
      <p className={`text-[17px] font-bold tabular-nums whitespace-nowrap text-right ${value === null ? "text-gray-300" : tone ? TONE[tone] : "text-gray-900"}`}>{value ?? "—"}</p>
      <div className="min-w-0 max-md:col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12px] text-gray-500">{value === null ? empty : basis}</span>
        {hint && <span className="text-[11.5px] text-gray-400">{hint}</span>}
        {chip}
        {state !== "ok" && <Chip tone={STATE_CHIP[state].tone}>{STATE_CHIP[state].text}</Chip>}
      </div>
    </li>
  );
}

function Empty({ line, state }: { line: string; state?: Exclude<State, "ok"> }) {
  return <p className="px-5 pb-3 pt-1 text-[12.5px] text-gray-400 flex flex-wrap items-center gap-2">— {line}{state && <Chip tone={STATE_CHIP[state].tone}>{STATE_CHIP[state].text}</Chip>}</p>;
}

/** 시장 규모 한 칸 — 올린 값(정본 확인 전이면 칩) + 허블로 다시 센 값 */
function MarketCell({ no, label, fig, recount, recountNote, missing }: { no: number; label: string; fig?: MarketFigure; recount?: number | null; recountNote?: string; missing: string }) {
  const v = fig?.value ?? null;
  return (
    <div className="px-5 py-3.5 min-w-0 border-t border-black/[0.06]">
      <p className="text-[12px] font-semibold text-gray-500 truncate"><span className="text-gray-400 tabular-nums mr-1.5">{no}</span>{label}</p>
      {v === null ? <p className="mt-1.5 text-[12.5px] text-gray-400">— {missing}</p> : (
        <>
          <p className="mt-0.5 text-[22px] font-bold tabular-nums tracking-[-0.02em] leading-tight whitespace-nowrap text-gray-900" title={won(v)}>{wonShort(v)}</p>
          {fig?.basis && <p className="mt-0.5 text-[11.5px] text-gray-500 truncate" title={fig.basis}>{fig.basis}</p>}
          {fig?.source && <p className="text-[11.5px] text-gray-400 truncate" title={fig.source}>{fig.source}</p>}
        </>
      )}
      {recount != null && <p className="mt-1 text-[11.5px] text-gray-500 truncate" title={recountNote}>허블 재계산 <b className="tabular-nums text-gray-700">{wonShort(recount)}</b>{recountNote ? ` · ${recountNote}` : ""}</p>}
      {v !== null && !fig?.confirmed && <div className="mt-1.5"><Chip tone="amber">정본 확인 필요</Chip></div>}
    </div>
  );
}

/** 영업 시간 단가 — 재무 설정값(기본 1만 원), 그 자리에서 고친다 */
function HourRate({ f, rate }: { f: FinanceData; rate: number | null }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (rate === null) return null;
  if (!edit) return <span>시간 단가 {won(rate)} · <button type="button" className="text-navy font-semibold hover:underline" onClick={() => { setV(String(rate)); setEdit(true); }}>바꾸기</button></span>;
  async function save() {
    setBusy(true); setErr(null);
    const e = await f.saveSettings({ hour_rate: v });
    setBusy(false);
    if (e) setErr(e); else setEdit(false);
  }
  return (
    <span className="mt-1 flex items-center gap-1.5 whitespace-normal">
      <span className="w-24"><Input inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} aria-label="시간 단가(원)" /></span>
      <Button size="sm" variant="primary" onClick={save} disabled={busy}>저장</Button>
      <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>취소</Button>
      {err && <span className="text-red-600">{err}</span>}
    </span>
  );
}
