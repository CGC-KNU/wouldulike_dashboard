import { addPeriod, invoiceCovers, invoiceMonths, type TaxInvoice } from "../draft/types";
import type { SpotJob } from "../draft/spot";
import type { AccountBalance, BillingLine, ExpenseCategory, ExpenseEntry, ExpenseItem, FundingEvent, IncomeEntry, PaidStore } from "./types";

/**
 * 재무 계산 — 화면 셋(현황 · 입금 · 출금)이 같은 함수를 쓴다. 같은 숫자를 두 곳에서 다르게 세지 않게.
 * 날짜는 모두 문자열(YYYY-MM-DD · YYYY-MM)로 다룬다. Date 로 바꾸면 시간대에 따라 하루가 밀린다.
 */

const DEAD = new Set(["CANCELED", "REJECTED"]);

/** 입금 확인된 세금계산서 → 입금 내역. 취소·반려된 건은 입금이 있어도 뺀다(입금 현황과 같은 규칙). */
export function invoiceIncome(invoices: TaxInvoice[]): IncomeEntry[] {
  return invoices
    .filter((i) => i.paid_at && !DEAD.has(i.status))
    .map((i) => ({
      id: `invoice:${i.id}`,
      paid_on: (i.paid_at as string).slice(0, 10),
      amount: i.total,
      supply: i.supply,
      tax: i.tax,
      source: "invoice" as const,
      name: i.name,
      detail: i.title,
    }));
}

/**
 * 정산 완료된 스팟 제작 → 입금 내역.
 * 가격이 적혀 있는 건만 금액을 센다. 가격이 비어 있으면 정가가 매장(파트너 여부)에 따라 달라서
 * 여기서는 알 수 없다 — 틀린 정가를 합계에 넣느니 `null`(금액 미정)로 두고 따로 센다.
 */
export function spotIncome(spots: SpotJob[]): IncomeEntry[] {
  return spots
    .filter((s) => s.paid_at)
    .map((s) => ({
      id: `spot:${s.id}`,
      paid_on: (s.paid_at as string).slice(0, 10),
      amount: typeof s.price === "number" && s.price >= 0 ? s.price : null,
      // 스팟은 가격 한 칸뿐 — 공급가 = 가격, 세액은 모름
      supply: typeof s.price === "number" && s.price >= 0 ? s.price : null,
      tax: null,
      source: "spot" as const,
      name: s.name,
      detail: s.product ? String(s.product) : null,
    }));
}

export function sortByDateDesc<T extends { paid_on: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.paid_on < b.paid_on ? 1 : a.paid_on > b.paid_on ? -1 : 0));
}

export const periodOf = (date: string): string => date.slice(0, 7);

/** end 를 마지막으로 거꾸로 n 개월 — 오래된 달이 앞. */
export function recentPeriods(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, k) => addPeriod(end, k - (n - 1)));
}

const sum = (xs: (number | null | undefined)[]): number => xs.reduce<number>((a, x) => a + (typeof x === "number" ? x : 0), 0);

export interface MonthRow {
  period: string;
  income: number;
  expense: number;
  net: number;
}

/** 달마다 입금 · 출금 · 순입금. 입금은 입금한 날, 출금은 돈이 나간 날(paid_on) 기준 — 현금 흐름이다. */
export function monthlySeries(income: IncomeEntry[], expenses: ExpenseEntry[], periods: string[]): MonthRow[] {
  return periods.map((period) => {
    const inc = sum(income.filter((i) => periodOf(i.paid_on) === period).map((i) => i.amount));
    const exp = sum(expenses.filter((e) => periodOf(e.paid_on) === period).map((e) => e.amount));
    return { period, income: inc, expense: exp, net: inc - exp };
  });
}

/** 그 달 입금 중 금액을 모르는 건 수 — 합계가 모자랄 수 있다고 화면이 말하게. */
export function unknownIncomeCount(income: IncomeEntry[], period: string): number {
  return income.filter((i) => periodOf(i.paid_on) === period && i.amount === null).length;
}

/** 지난달 대비 증감(%). 지난달이 0 이면 비교할 수 없어 null. */
export function changePct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export interface CategoryRow {
  category: ExpenseCategory;
  amount: number;
  count: number;
}

/** 그 달 출금을 분류별로 — 큰 순. */
export function byCategory(expenses: ExpenseEntry[], period: string): CategoryRow[] {
  const m = new Map<ExpenseCategory, CategoryRow>();
  for (const e of expenses) {
    if (periodOf(e.paid_on) !== period) continue;
    const cur = m.get(e.category) ?? { category: e.category, amount: 0, count: 0 };
    cur.amount += e.amount;
    cur.count += 1;
    m.set(e.category, cur);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

/** 반복 항목이 그 달에 나가야 하는 항목인가 — 쉬는 항목 · 시작 전 · 종료 후 · (매년이면) 다른 달은 아니다. */
export function itemAppliesIn(item: ExpenseItem, period: string): boolean {
  if (!item.active) return false;
  if (period < item.start_period) return false;
  if (item.end_period && period > item.end_period) return false;
  if (item.cycle === "YEARLY") return item.start_period.slice(5) === period.slice(5);
  return true;
}

/**
 * 그 달의 유료 식당 수. 청구 시작 월이 그 달보다 뒤인 매장은 아직 안 센다.
 * ⚠️ 매장의 **지금** 상태(제휴 · 플랜)로 세므로 지난 달 숫자는 그때와 다를 수 있다 — 그래서 지급을 기록할 때 계산된 금액을
 * 기록에 **그대로 박는다**(기록은 이후 매장이 바뀌어도 변하지 않는다). 못 읽었으면 null.
 */
export function paidStoreCount(stores: PaidStore[] | null, period: string): number | null {
  if (!stores) return null;
  return stores.filter((s) => !s.start || s.start <= period).length;
}

/** 출금 방식대로 나갈 돈을 계산한다. 단가를 모르거나(null), 곱할 수를 모르면 null(모름) — 0 으로 채우지 않는다. */
export function resolveAmount(item: Pick<ExpenseItem, "method" | "amount">, paidCount: number | null): number | null {
  if (item.amount === null) return null;
  if (item.method === "PER_PAID_STORE") return paidCount === null ? null : item.amount * paidCount;
  return item.amount;
}

export interface DueRow {
  item: ExpenseItem;
  /** 방식대로 계산한 나갈 돈 — 모르면 null */
  amount: number | null;
  /** 유료 식당 수 방식일 때 곱한 수(아니면 null) */
  count: number | null;
  /** 나가기로 한 날 — pay_day 를 모르면 null */
  due_on: string | null;
  overdue: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 그 달 마지막 날 — 31일에 나가는 항목이 2월에는 28일로 간다. */
function lastDay(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * 그 달에 나가야 하는데 아직 기록이 없는 반복 항목 — 「이번 달 예정」.
 * 기록이 있으면(같은 항목 · 같은 귀속 월) 예정에서 빠진다. 지급일이 오늘보다 앞이면 `overdue`(미기록).
 */
export function dueRows(items: ExpenseItem[], entries: ExpenseEntry[], period: string, today: string, paidCount: number | null = null): DueRow[] {
  const done = new Set(entries.filter((e) => e.item_id && e.period === period).map((e) => e.item_id));
  return items
    .filter((it) => itemAppliesIn(it, period) && !done.has(it.id))
    .map((item) => {
      const due_on = item.pay_day ? `${period}-${pad(Math.min(item.pay_day, lastDay(period)))}` : null;
      return { item, amount: resolveAmount(item, paidCount), count: item.method === "PER_PAID_STORE" ? paidCount : null, due_on, overdue: due_on !== null && due_on < today };
    })
    .sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999") || a.item.name.localeCompare(b.item.name, "ko"));
}

/** 예정 합계 — 금액을 아는 항목만. 모르는 항목 수는 따로 돌려줘 화면이 「N건은 금액 미입력」이라고 말한다. */
export function dueTotals(rows: DueRow[]): { amount: number; unknown: number } {
  return { amount: sum(rows.map((r) => r.amount)), unknown: rows.filter((r) => r.amount === null).length };
}

/** 원 단위 표기 — 화면 어디서나 같은 모양. */
export const won = (n: number): string => `${n.toLocaleString("ko-KR")}원`;

/** 큰 숫자는 만 단위로 줄여 차트 눈금에 쓴다. 1,250,000 → 125만 */
export function wonShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 100_000_000) return `${(n / 100_000_000).toFixed(a % 100_000_000 ? 1 : 0)}억`;
  if (a >= 10_000) return `${Math.round(n / 10_000).toLocaleString("ko-KR")}만`;
  return n.toLocaleString("ko-KR");
}

/* ═══════════ 재무장표 — 런웨이 · 번 · 대사 · 부가세 · MRR (설계 부록 A 산식 그대로) ═══════════
   모르는 값은 0 이 아니라 null 이다. 화면은 null 을 「—」 와 「무엇을 넣으면 계산되는지」로 보여 준다. */

/** 입금(공급가) — 매출로 세는 돈. 세액은 다음 납부 때 나갈 돈이라 뺀다. */
export function supplyIn(income: IncomeEntry[], period: string): number {
  return sum(income.filter((i) => periodOf(i.paid_on) === period).map((i) => i.supply));
}
export function taxIn(income: IncomeEntry[], period: string): number {
  return sum(income.filter((i) => periodOf(i.paid_on) === period).map((i) => i.tax));
}

/** 세금계산서 → 구독 청구 줄. 발행됐거나 입금된 건만(취소 · 반려 제외). MRR 은 입금이 아니라 청구 기준이다. */
export function billingLines(invoices: TaxInvoice[]): BillingLine[] {
  return invoices
    .filter((i) => !DEAD.has(i.status) && (i.status === "ISSUED" || i.paid_at))
    .map((i) => ({ id: i.id, restaurant_id: i.restaurant_id, period: i.period, months: invoiceMonths(i), supply: i.supply }));
}

/** MRR = 그달 귀속 구독료 공급가 합. 여러 달치 계산서는 달 수로 나눠 편다. 스팟은 넣지 않는다(비반복). */
export function mrrOf(lines: BillingLine[], period: string): number {
  return Math.round(sum(lines.filter((l) => invoiceCovers(l, period)).map((l) => l.supply / l.months)));
}

/**
 * 부가세 예수금 — 이번 과세기간(1~6월 · 7~12월)에 입금된 세액 합. 1월 · 7월은 직전 기간 확정신고(25일)가 남아 있어 그 기간 것도 더한다.
 * 매입세액 공제는 모른다(출금에 세액 칸이 없다) — 그래서 이 값은 **많게 잡힌 쪽**이다. 스팟처럼 세액을 모르는 입금은 `unknown` 으로 센다.
 */
export function vatPayable(income: IncomeEntry[], period: string): { amount: number; unknown: number; from: string; due: string } {
  const y = Number(period.slice(0, 4)), m = Number(period.slice(5));
  const halfStart = m <= 6 ? `${y}-01` : `${y}-07`;
  const filingMonth = m === 1 || m === 7;
  const from = filingMonth ? addPeriod(halfStart, -6) : halfStart;
  const due = filingMonth ? `${period}-25` : m <= 6 ? `${y}-07-25` : `${y + 1}-01-25`;
  const rows = income.filter((i) => { const p = periodOf(i.paid_on); return p >= from && p <= period; });
  return { amount: sum(rows.map((i) => i.tax)), unknown: rows.filter((i) => i.tax === null).length, from, due };
}

export type BurnBasis = 1 | 3 | 6;
export const BURN_BASIS_LABEL: Record<BurnBasis, string> = { 1: "지난달", 3: "3개월 평균", 6: "6개월 평균" };

export interface BurnMonth {
  period: string;
  /** 총번 — 그달 현금 유출 합계 */
  gross: number;
  /** 영업 유입 — 통장에 들어온 입금(조달은 입금 내역에 없어 저절로 빠진다) */
  inflow: number;
  /** 순번 = 영업 유출 − 영업 유입 */
  net: number;
  /** 일회성 지출 — 행동 방식이 「일회성」인 항목의 지급만. 항목 없이 적은 출금은 성격을 몰라 빼지 않는다(번을 적게 보지 않게). */
  oneOff: number;
  /** 그 달에 출금 기록이 하나라도 있는가 — 없으면 장부를 안 적은 달로 보고 평균에서 뺀다(0원 달이 아니다) */
  recorded: boolean;
}

export function burnMonth(income: IncomeEntry[], expenses: ExpenseEntry[], items: ExpenseItem[], period: string): BurnMonth {
  const oneOffIds = new Set(items.filter((i) => i.behavior === "ONE_OFF").map((i) => i.id));
  const out = expenses.filter((e) => periodOf(e.paid_on) === period);
  const gross = sum(out.map((e) => e.amount));
  const inflow = sum(income.filter((i) => periodOf(i.paid_on) === period).map((i) => i.amount));
  const oneOff = sum(out.filter((e) => e.item_id !== null && oneOffIds.has(e.item_id)).map((e) => e.amount));
  return { period, gross, inflow, net: gross - inflow, oneOff, recorded: out.length > 0 };
}

export interface BurnSummary {
  /** 계산에 쓴 마감월 — 기록 있는 달만 */
  months: string[];
  /** 선택 기준의 순번 · 총번 · 운영 번(순번 − 일회성). 기록이 하나도 없으면 null. */
  net: number | null;
  gross: number | null;
  operating: number | null;
  /** 지난달(마감월 하나)의 순번 — 그 달 기록이 없으면 null */
  lastNet: number | null;
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, x) => a + x, 0) / xs.length) : null);

/** 순번(기준) = 최근 N개 마감월 순번의 산술 평균. `closed` 는 마지막 마감월(이번 달은 아직 안 닫혔다). */
export function burnSummary(income: IncomeEntry[], expenses: ExpenseEntry[], items: ExpenseItem[], closed: string, basis: BurnBasis): BurnSummary {
  const rows = recentPeriods(closed, basis).map((p) => burnMonth(income, expenses, items, p)).filter((r) => r.recorded);
  const last = burnMonth(income, expenses, items, closed);
  return {
    months: rows.map((r) => r.period),
    net: avg(rows.map((r) => r.net)),
    gross: avg(rows.map((r) => r.gross)),
    operating: avg(rows.map((r) => r.net - r.oneOff)),
    lastNet: last.recorded ? last.net : null,
  };
}

export interface BalanceSnapshot {
  period: string;
  /** 계좌마다 그 달 가장 늦은 기준일 한 줄 */
  rows: AccountBalance[];
  total: number;
  reconciledAll: boolean;
}

const accountKey = (b: AccountBalance) => `${b.account_name}|${b.last4 ?? ""}`;

/** 그 달 계좌별 잔고 — 같은 계좌를 여러 번 적었으면 기준일이 늦은 것. 그 달 기록이 없으면 null. */
export function balancesIn(balances: AccountBalance[], period: string): BalanceSnapshot | null {
  const m = new Map<string, AccountBalance>();
  for (const b of balances.filter((x) => x.period === period)) {
    const k = accountKey(b), cur = m.get(k);
    if (!cur || b.as_of > cur.as_of) m.set(k, b);
  }
  if (!m.size) return null;
  const rows = [...m.values()].sort((a, b) => a.account_name.localeCompare(b.account_name, "ko"));
  return { period, rows, total: sum(rows.map((r) => r.amount)), reconciledAll: rows.every((r) => r.reconciled) };
}

/** 그 달 이전(포함)에서 잔고를 적은 가장 최근 달. */
export function latestBalances(balances: AccountBalance[], upTo: string): BalanceSnapshot | null {
  const periods = [...new Set(balances.map((b) => b.period).filter((p) => p <= upTo))].sort();
  return periods.length ? balancesIn(balances, periods[periods.length - 1]) : null;
}

/** 입금된 조달 중 쓸 곳이 정해진 돈(지원금 전용)의 남은 잔액 — 모르면 금액 전체를 묶인 돈으로 본다. */
export function restrictedLeft(fundings: FundingEvent[], upTo: string): number {
  return sum(fundings.filter((f) => f.status === "RECEIVED" && f.restricted && f.received_on && periodOf(f.received_on) <= upTo).map((f) => f.restricted_left ?? f.amount));
}

/** 그달 입금된 조달 합 — 장부 잔고 계산에만 쓴다(순번에는 넣지 않는다). */
export function fundingIn(fundings: FundingEvent[], period: string): number {
  return sum(fundings.filter((f) => f.status === "RECEIVED" && f.received_on && periodOf(f.received_on) === period).map((f) => f.amount));
}

export type ReconcileState = { state: "none"; reason: string } | { state: "ok" | "need"; ledger: number; diff: number };
export const RECONCILE_TOLERANCE = 10_000;

/**
 * 대사 — 장부로 굴린 잔고(지난달 말 잔고 + 그달 입금 − 그달 출금 + 그달 입금된 조달)와 적은 잔고를 맞춰 본다.
 * 차이가 1만 원을 넘으면 「대사 필요」. 지난달 말 잔고가 없으면 굴릴 시작점이 없어 대사할 수 없다.
 */
export function reconcile(snap: BalanceSnapshot, balances: AccountBalance[], income: IncomeEntry[], expenses: ExpenseEntry[], fundings: FundingEvent[]): ReconcileState {
  const prev = balancesIn(balances, addPeriod(snap.period, -1));
  if (!prev) return { state: "none", reason: "지난달 말 잔고가 없어 장부와 맞춰 볼 수 없습니다." };
  const p = snap.period;
  const ledger = prev.total + sum(income.filter((i) => periodOf(i.paid_on) === p).map((i) => i.amount)) - sum(expenses.filter((e) => periodOf(e.paid_on) === p).map((e) => e.amount)) + fundingIn(fundings, p);
  const diff = snap.total - ledger;
  return { state: Math.abs(diff) > RECONCILE_TOLERANCE ? "need" : "ok", ledger, diff };
}

export type RunwayTone = "green" | "amber" | "red";

/** 런웨이(개월) = 가용 현금 ÷ 순번. 순번 ≤ 0 이면 흑자(해당 없음). 소진 예상월 = 기준월 + 런웨이(올림, 월말로 표기). */
export function runwayOf(available: number, net: number, base: string): { surplus: true } | { surplus: false; months: number; zeroMonth: string; tone: RunwayTone } {
  if (net <= 0) return { surplus: true };
  const months = Math.max(0, available / net);
  return { surplus: false, months, zeroMonth: addPeriod(base, Math.ceil(months)), tone: months >= 12 ? "green" : months >= 6 ? "amber" : "red" };
}
