import { addPeriod } from "../draft/types";
import { itemAppliesIn, mrrOf, paidStoreCount, periodOf, resolveAmount, vatPayable } from "./calc";
import type { BillingLine, ChurnRow, ExpenseEntry, ExpenseItem, GoalsDoc, HubbleSummary, IncomeEntry, MarketDoc, PaidStore, PlanChange, PlanCostKey, PlanDoc } from "./types";

/**
 * 재무 지표 20개(1122) — 재무 현황 「매장 1곳 단위 · 성장 · 유지 · 현금 · 계획 · 시장 · 상권」 묶음의 산식.
 * 산식 정본은 설계 보고서(1121 에테르 재무장표) 부록 A 와 재무지표_후보_1122.html. calc.ts 와 같은 규칙:
 * 모르는 값은 0 이 아니라 null, 날짜는 문자열(YYYY-MM · YYYY-MM-DD).
 *
 * 유료 매장이 적어 한 곳만 바뀌어도 크게 흔들리므로 매장 1곳 단위는 **마감된 최근 3개월을 합쳐서** 센다
 * (달마다 비율을 내 평균하지 않고, 돈과 매장-월을 각각 더해 나눈다).
 */

const sum = (xs: (number | null | undefined)[]): number => xs.reduce<number>((a, x) => a + (typeof x === "number" ? x : 0), 0);
const PAID = new Set(["BOOST", "CONTENT"]);
/** 유료였던 해지만 센다 — 무료 매장 종료는 유료 유지율 · 신규 유료와 상관없다 */
const paidChurn = (rows: ChurnRow[]) => rows.filter((c) => c.tier !== null && PAID.has(c.tier));

/* ─────────── ① 매장 1곳 단위 ─────────── */

/**
 * 그 달(귀속 월) 반복 항목 비용 — 행동 방식이 `pick` 에 드는 항목만. 기록이 있으면 기록한 금액, 없으면 항목 금액(방식대로).
 * 금액을 모르는 항목은 `unknown` 으로 센다(0 으로 채우지 않는다).
 */
export function itemCost(items: ExpenseItem[], entries: ExpenseEntry[], period: string, paidCount: number | null, pick: (i: ExpenseItem) => boolean): { amount: number; unknown: number } {
  let amount = 0, unknown = 0;
  for (const it of items.filter(pick)) {
    const rec = entries.filter((e) => e.item_id === it.id && e.period === period);
    if (rec.length) { amount += sum(rec.map((e) => e.amount)); continue; }
    if (!itemAppliesIn(it, period)) continue;
    const a = resolveAmount(it, paidCount);
    if (a === null) unknown += 1; else amount += a;
  }
  return { amount, unknown };
}

const isVariable = (i: ExpenseItem) => i.behavior === "VARIABLE";
/** 고정비 — 고정 · 준변동 · 미분류 항목(성격을 모르면 고정으로 본다 — 손익분기를 낮게 보지 않게) */
const isFixedLike = (i: ExpenseItem) => i.behavior !== "VARIABLE" && i.behavior !== "ONE_OFF";

export interface UnitEconomics {
  months: string[];
  /** 매장-월 합(유료 매장 수를 달마다 더한 것) — 0 이면 매장당 지표를 못 낸다 */
  storeMonths: number;
  arpa: number | null;
  variablePerStore: number | null;
  variableUnknown: number;
  contribution: number | null;
  /** 월 고정비(3개월 평균) — 고정 · 준변동 · 미분류 항목 + 항목 없이 적은 태그 없는 출금 */
  fixed: number | null;
  fixedUnknown: number;
  breakEven: number | null;
  /** 매출총이익률 — (MRR − COGS 항목 비용) ÷ MRR. COGS 항목이 하나도 없으면 null */
  grossMargin: number | null;
}

export function unitEconomics(billing: BillingLine[], items: ExpenseItem[], entries: ExpenseEntry[], stores: PaidStore[] | null, months: string[]): UnitEconomics {
  let mrr = 0, storeMonths = 0, variable = 0, variableUnknown = 0, fixed = 0, fixedUnknown = 0, cogs = 0, fixedMonths = 0;
  const hasCogs = items.some((i) => i.account === "COGS");
  for (const p of months) {
    const n = paidStoreCount(stores, p);
    mrr += mrrOf(billing, p);
    storeMonths += n ?? 0;
    const v = itemCost(items, entries, p, n, isVariable);
    variable += v.amount; variableUnknown += v.unknown;
    const f = itemCost(items, entries, p, n, isFixedLike);
    const loose = sum(entries.filter((e) => e.period === p && !e.item_id && !e.tag).map((e) => e.amount));
    if (f.amount + loose > 0 || f.unknown) fixedMonths += 1;
    fixed += f.amount + loose; fixedUnknown += f.unknown;
    cogs += itemCost(items, entries, p, n, (i) => i.account === "COGS").amount;
  }
  // 구독 청구가 하나도 없거나, 그 기간에 걸리는 변동 항목이 하나도 없으면 0원이 아니라 모름이다
  const varSeen = months.some((p) => items.some((i) => isVariable(i) && (itemAppliesIn(i, p) || entries.some((e) => e.item_id === i.id && e.period === p))));
  const arpa = storeMonths && mrr > 0 ? Math.round(mrr / storeMonths) : null;
  const variablePerStore = storeMonths && varSeen ? Math.round(variable / storeMonths) : null;
  const contribution = arpa !== null && variablePerStore !== null ? arpa - variablePerStore : null;
  const fixedAvg = fixedMonths ? Math.round(fixed / fixedMonths) : null;
  return {
    months, storeMonths, arpa, variablePerStore, variableUnknown, contribution,
    fixed: fixedAvg, fixedUnknown,
    breakEven: fixedAvg !== null && contribution !== null && contribution > 0 ? Math.ceil(fixedAvg / contribution) : null,
    grossMargin: hasCogs && mrr > 0 ? (mrr - cogs) / mrr : null,
  };
}

/** 그 기간에 유료를 시작한 매장 수 — 지금 유료인 곳 + 그 뒤 해지한 곳(해지 기록의 시작 월). 같은 매장은 한 번. */
export function newPaidCount(stores: PaidStore[] | null, churn: ChurnRow[], months: string[]): number | null {
  if (!stores) return null;
  const inWin = (p: string | null | undefined) => Boolean(p) && months.includes(p as string);
  const ids = new Set(stores.filter((s) => inWin(s.start)).map((s) => s.id));
  for (const c of paidChurn(churn)) if (inWin(c.start)) ids.add(c.restaurant_id);
  return ids.size;
}

/** 입점 비용(일회성) — 입점 태그 출금 합 ÷ 그 기간 신규 유료. 태그가 한 번도 없으면 기록 시작 전(null). */
export function onboardingCost(entries: ExpenseEntry[], months: string[], newPaid: number | null): { total: number; perStore: number | null; started: boolean } {
  const started = entries.some((e) => e.tag === "onboarding");
  const total = sum(entries.filter((e) => e.tag === "onboarding" && months.includes(periodOf(e.paid_on))).map((e) => e.amount));
  return { total, started, perStore: started && newPaid ? Math.round(total / newPaid) : null };
}

/**
 * CAC = (영업 시간 × 시간 단가 + S&M 지출) ÷ 신규 유료. 영업 시간은 **후보에 쓴 시간**만(매장 관리 시간은 유지 비용이다).
 * S&M 지출 = 회계 위치 S&M 항목 중 변동이 아닌 것(식사권은 유료 매장 수에 비례하는 유지 비용이라 뺀다) + 항목 없이 적은 「마케팅·협찬」.
 * 적자 스팟 손실은 스팟 원가 기록이 없어 아직 못 넣는다.
 */
export function cacOf(entries: ExpenseEntry[], items: ExpenseItem[], salesMinutes: Record<string, { lead: number; store: number }>, salesSince: string | null, hourRate: number, months: string[], newPaid: number | null) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const minutes = sum(months.map((p) => salesMinutes[p]?.lead));
  const people = Math.round((minutes / 60) * hourRate);
  const sm = sum(entries.filter((e) => months.includes(periodOf(e.paid_on))).filter((e) => {
    const it = e.item_id ? byId.get(e.item_id) : undefined;
    return it ? it.account === "S&M" && it.behavior !== "VARIABLE" : e.category === "마케팅·협찬" && !e.tag;
  }).map((e) => e.amount));
  const started = Boolean(salesSince);
  return { minutes, people, sm, started, cac: started && newPaid ? Math.round((people + sm) / newPaid) : null };
}

/** CAC 회수기간(개월) = CAC ÷ (ARPA × 매출총이익률). */
export function paybackMonths(cac: number | null, arpa: number | null, grossMargin: number | null): number | null {
  if (cac === null || arpa === null || grossMargin === null) return null;
  const m = arpa * grossMargin;
  return m > 0 ? cac / m : null;
}

/* ─────────── ② 성장 · 유지 ─────────── */

/**
 * 3개월 유지율 — 시작 후 3개월째에도 유료인 비율. 코호트 = 유료 시작 월이 [마감월−8, 마감월−3] 인 매장(6개 코호트를 합친다).
 * 지금 유료인 곳은 남은 것, 해지 기록이 있는 곳은 해지일이 시작+3개월 전이면 떠난 것. 시작 월을 모르는 매장은 못 센다.
 */
export function retention3(stores: PaidStore[] | null, churn: ChurnRow[], closed: string): { rate: number | null; started: number; retained: number; from: string; to: string } {
  const from = addPeriod(closed, -8), to = addPeriod(closed, -3);
  const inWin = (p: string | null | undefined): p is string => Boolean(p) && (p as string) >= from && (p as string) <= to;
  const cohort = new Map<number, boolean>();
  for (const c of paidChurn(churn)) if (inWin(c.start)) cohort.set(c.restaurant_id, periodOf(c.ended_on) >= addPeriod(c.start, 3));
  for (const s of stores ?? []) if (inWin(s.start)) cohort.set(s.id, true);
  const started = cohort.size, retained = [...cohort.values()].filter(Boolean).length;
  return { rate: stores && started ? retained / started : null, started, retained, from, to };
}

/** 무료 → 유료 전환율 — 최근 3개월 전환 ÷ (지금 무료 + 그 전환). 플랜 변경 기록이 없으면 기록 시작 전(null). */
export function conversionRate(history: PlanChange[], freeNow: number | null, months: string[]): { rate: number | null; converted: number; started: boolean; since: string | null } {
  const since = history.length ? history.map((h) => h.at).sort()[0].slice(0, 10) : null;
  const converted = new Set(history.filter((h) => h.from === "FREE" && PAID.has(h.to) && months.includes(h.at.slice(0, 7))).map((h) => h.restaurant_id)).size;
  return { since, converted, started: Boolean(since), rate: since && freeNow !== null && freeNow + converted > 0 ? converted / (freeNow + converted) : null };
}

/** NRR — base 달에 구독료가 있던 매장들의 지금 MRR ÷ 그때 MRR. 새로 들어온 매장은 빼고, 해지 · 쉼(방학 0원)은 들어간다. */
export function nrrOf(billing: BillingLine[], period: string, lookback = 3): { rate: number | null; base: string; cohort: number } {
  const base = addPeriod(period, -lookback);
  const ids = [...new Set(billing.map((l) => l.restaurant_id))];
  const of = (rid: number, p: string) => mrrOf(billing.filter((l) => l.restaurant_id === rid), p);
  const cohort = ids.filter((rid) => of(rid, base) > 0);
  const then = sum(cohort.map((rid) => of(rid, base)));
  return { base, cohort: cohort.length, rate: then > 0 ? sum(cohort.map((rid) => of(rid, period))) / then : null };
}

/** 영업 깔때기 — 계약 완료 ÷ 컨택한 후보(미컨택 제외). 「몇 곳 만나야 한 곳」은 그 역수. */
export function funnelOf(stages: Record<string, number> | null): { contacted: number; contracted: number; rate: number | null; perDeal: number | null } | null {
  if (!stages) return null;
  const total = sum(Object.values(stages));
  const contacted = total - (stages["미컨택"] ?? 0);
  const contracted = stages["계약 완료"] ?? 0;
  return { contacted, contracted, rate: contacted ? contracted / contacted : null, perDeal: contracted ? contacted / contracted : null };
}

/* ─────────── ③ 현금 · 계획 ─────────── */

/**
 * 목표 표 열 이름 → 마감 달. 「26.12」 → 2026-12, 「27-1 · 6월 말」 → 2027-06, 「27-2」 → 2027-12(학기 끝), 「지금 · 11-20」 → null.
 */
export function milestonePeriod(label: string): string | null {
  if (/지금/.test(label)) return null;
  const dot = label.match(/(\d{2})\.(\d{1,2})(?!\d)/);
  if (dot && Number(dot[2]) >= 1 && Number(dot[2]) <= 12) return `20${dot[1]}-${dot[2].padStart(2, "0")}`;
  const sem = label.match(/(\d{2})-([12])(?!\d)/);
  if (!sem) return null;
  const mon = label.match(/(\d{1,2})월/);
  const m = mon && Number(mon[1]) >= 1 && Number(mon[1]) <= 12 ? Number(mon[1]) : sem[2] === "1" ? 6 : 12;
  return `20${sem[1]}-${String(m).padStart(2, "0")}`;
}

/** 다음 마일스톤 — 오늘 달 뒤의 첫 열. 조달 착수 마감선 = 소진월 − 조달 기간(4개월). */
export const RAISE_LEAD_MONTHS = 4;
export function nextMilestone(goals: GoalsDoc | null, today: string): { label: string; period: string } | null {
  for (const label of goals?.columns ?? []) {
    const p = milestonePeriod(label);
    if (p && p > today) return { label, period: p };
  }
  return null;
}

/**
 * Default alive — 지금 비용 그대로, MRR 이 최근 3개월 속도로 늘면 돈이 떨어지기 전에 흑자가 되는가(Paul Graham 2015).
 * cost = 월 총번(현금 유출). runwayMonths 가 null 이면 흑자(이미 순번 ≤ 0). 60개월 안에 못 닿으면 흑자 예상월 없음.
 */
export function defaultAlive(billing: BillingLine[], closed: string, cost: number | null, runwayMonths: number | null | "surplus"): { alive: boolean | null; growth: number | null; profitMonth: string | null } {
  const now = mrrOf(billing, closed), then = mrrOf(billing, addPeriod(closed, -3));
  const growth = then > 0 ? Math.pow(now / then, 1 / 3) - 1 : null;
  if (cost === null) return { alive: null, growth, profitMonth: null };
  if (runwayMonths === "surplus" || now >= cost) return { alive: true, growth, profitMonth: closed };
  if (growth === null || growth <= 0 || now <= 0) return { alive: runwayMonths === null ? null : false, growth, profitMonth: null };
  const k = Math.ceil(Math.log(cost / now) / Math.log(1 + growth));
  const profitMonth = k <= 60 ? addPeriod(closed, k) : null;
  return { alive: runwayMonths === null ? null : profitMonth !== null && k <= runwayMonths, growth, profitMonth };
}

export type BvaTone = "small" | "ok" | "amber" | "red";
export interface BvaRow { key: "revenue" | PlanCostKey | "UNTAGGED"; label: string; plan: number | null; actual: number; diff: number | null; pct: number | null; tone: BvaTone }
const BVA_LABEL: Record<BvaRow["key"], string> = { revenue: "매출 (공급가)", FIXED: "고정비", SEMI_VARIABLE: "준변동비", VARIABLE: "변동비", ONE_OFF: "일회성", UNTAGGED: "미분류 출금" };
export const BVA_IGNORE = 100_000;

/** 차이 색 — 10만 원 미만은 무시, ±20% 빨강, ±10% 노랑. */
export function bvaTone(plan: number | null, actual: number): BvaTone {
  if (plan === null) return "small";
  const diff = actual - plan;
  if (Math.abs(diff) < BVA_IGNORE) return "small";
  const pct = plan ? Math.abs(diff) / plan : 1;
  return pct >= 0.2 ? "red" : pct >= 0.1 ? "amber" : "ok";
}

/**
 * 계획 대비 실적 — 그 달 계획값(런웨이 모델)과 실적을 계정(매출 · 행동 방식) 단위로. 실적 비용은 돈이 나간 달 기준.
 * 항목 없이 적은 출금 중 입점 · 상권 태그는 일회성, 나머지는 「미분류」(계획에 없는 줄)로 따로 보인다.
 */
export function budgetVsActual(plan: PlanDoc | null, income: IncomeEntry[], entries: ExpenseEntry[], items: ExpenseItem[], period: string): { rows: BvaRow[]; planned: boolean; first: string | null } {
  const months = plan?.months ?? [];
  const first = months.length ? months.map((m) => m.period).sort()[0] : null;
  const pm = months.find((m) => m.period === period);
  if (!pm) return { rows: [], planned: false, first };
  const byId = new Map(items.map((i) => [i.id, i]));
  const actual: Record<BvaRow["key"], number> = { revenue: sum(income.filter((i) => periodOf(i.paid_on) === period).map((i) => i.supply)), FIXED: 0, SEMI_VARIABLE: 0, VARIABLE: 0, ONE_OFF: 0, UNTAGGED: 0 };
  for (const e of entries.filter((x) => periodOf(x.paid_on) === period)) {
    const b = e.item_id ? byId.get(e.item_id)?.behavior : e.tag ? "ONE_OFF" : null;
    actual[b ?? "UNTAGGED"] += e.amount;
  }
  const planOf = (k: BvaRow["key"]): number | null => (k === "revenue" ? pm.revenue : k === "UNTAGGED" ? null : pm.cost[k] ?? null);
  const keys: BvaRow["key"][] = ["revenue", "FIXED", "SEMI_VARIABLE", "VARIABLE", "ONE_OFF", "UNTAGGED"];
  const rows = keys.filter((k) => k !== "UNTAGGED" || actual.UNTAGGED > 0).map((k) => {
    const p = planOf(k), a = actual[k];
    return { key: k, label: BVA_LABEL[k], plan: p, actual: a, diff: p === null ? null : a - p, pct: p ? (a - p) / p : null, tone: bvaTone(p, a) };
  });
  return { rows, planned: true, first };
}

/**
 * 부가세 순납부액 = 받은 세액(예수금) − 낸 세액(출금의 매입 세액). 기간은 vatPayable 과 같다.
 * 세액을 안 적은 출금은 `missing` 으로 센다 — 그만큼 순납부가 많게 잡힌다.
 */
export function vatNet(income: IncomeEntry[], entries: ExpenseEntry[], period: string): { out: number; input: number; net: number; missing: number; recorded: number; unknownIn: number; due: string } {
  const v = vatPayable(income, period);
  const win = entries.filter((e) => { const p = periodOf(e.paid_on); return p >= v.from && p <= period; });
  const withTax = win.filter((e) => typeof e.tax === "number");
  const input = sum(withTax.map((e) => e.tax));
  return { out: v.amount, input, net: v.amount - input, missing: win.length - withTax.length, recorded: withTax.length, unknownIn: v.unknown, due: v.due };
}

/* ─────────── ④ 시장 · 상권 ─────────── */

export interface CampusRow { campus: string; paid: number; partners: number; restaurants: number | null; paidRate: number | null; partnerRate: number | null; entryCost: number; entryPayback: number | null }

/**
 * 상권별 — 침투율(유료 · 파트너 ÷ 허블 1km 식당) · 진입 비용(상권 태그 출금 누적) · 회수기간(진입 비용 ÷ 그 상권 월 공헌이익).
 */
export function campusRows(paid: PaidStore[] | null, free: { id: number; campus: string | null }[] | null, hubble: HubbleSummary | null, entries: ExpenseEntry[], contribution: number | null, campuses: readonly string[]): CampusRow[] {
  return campuses.map((campus) => {
    const p = (paid ?? []).filter((s) => s.campus === campus).length;
    const partners = p + (free ?? []).filter((s) => s.campus === campus).length;
    const n = hubble?.campuses.find((c) => c.campus === campus)?.n ?? null;
    const entryCost = sum(entries.filter((e) => e.tag === "campus" && e.campus === campus).map((e) => e.amount));
    const monthly = contribution !== null ? contribution * p : null;
    return {
      campus, paid: p, partners, restaurants: n,
      paidRate: paid && n ? p / n : null, partnerRate: paid && free && n ? partners / n : null,
      entryCost, entryPayback: entryCost > 0 && monthly && monthly > 0 ? entryCost / monthly : null,
    };
  });
}

/** 허블로 다시 센 TAM · SAM — 문서의 Boost 연간 요금 × 식당 수. 요금 · 허블이 없으면 null. */
export function marketRecount(market: MarketDoc | null, hubble: HubbleSummary | null): { tam: number | null; sam: number | null; samRestaurants: number | null } {
  const price = market?.boost_annual ?? null;
  if (!price || !hubble) return { tam: null, sam: null, samRestaurants: null };
  const sidos = market?.sam_sidos ?? [];
  // 허블 시도는 행안부 표기(「대구광역시」 · 「경상북도」) — 문서엔 그대로 적되, 앞부분만 적어도(「대구」) 맞춘다
  const keys = Object.keys(hubble.bySido);
  const samRestaurants = sidos.length ? sum(keys.filter((k) => sidos.some((s) => k === s || k.startsWith(s))).map((k) => hubble.bySido[k])) : null;
  return { tam: hubble.total * price, sam: samRestaurants === null ? null : samRestaurants * price, samRestaurants };
}
