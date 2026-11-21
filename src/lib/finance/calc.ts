import { addPeriod, type TaxInvoice } from "../draft/types";
import type { SpotJob } from "../draft/spot";
import type { ExpenseCategory, ExpenseEntry, ExpenseItem, IncomeEntry } from "./types";

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

/** 고정 비용 항목이 그 달에 나가야 하는 항목인가 — 쉬는 항목 · 시작 전 · 종료 후 · (매년이면) 다른 달은 아니다. */
export function itemAppliesIn(item: ExpenseItem, period: string): boolean {
  if (!item.active) return false;
  if (period < item.start_period) return false;
  if (item.end_period && period > item.end_period) return false;
  if (item.cycle === "YEARLY") return item.start_period.slice(5) === period.slice(5);
  return true;
}

export interface DueRow {
  item: ExpenseItem;
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
 * 그 달에 나가야 하는데 아직 기록이 없는 고정 비용 — 「이번 달 예정」.
 * 기록이 있으면(같은 항목 · 같은 귀속 월) 예정에서 빠진다. 지급일이 오늘보다 앞이면 `overdue`(미기록).
 */
export function dueRows(items: ExpenseItem[], entries: ExpenseEntry[], period: string, today: string): DueRow[] {
  const done = new Set(entries.filter((e) => e.item_id && e.period === period).map((e) => e.item_id));
  return items
    .filter((it) => itemAppliesIn(it, period) && !done.has(it.id))
    .map((item) => {
      const due_on = item.pay_day ? `${period}-${pad(Math.min(item.pay_day, lastDay(period)))}` : null;
      return { item, due_on, overdue: due_on !== null && due_on < today };
    })
    .sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999") || a.item.name.localeCompare(b.item.name, "ko"));
}

/** 예정 합계 — 금액을 아는 항목만. 모르는 항목 수는 따로 돌려줘 화면이 「N건은 금액 미입력」이라고 말한다. */
export function dueTotals(rows: DueRow[]): { amount: number; unknown: number } {
  return { amount: sum(rows.map((r) => r.item.amount)), unknown: rows.filter((r) => r.item.amount === null).length };
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
