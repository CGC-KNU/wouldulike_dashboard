/**
 * 재무 — 타입.
 *
 * 입금은 **읽기 전용**이다. 입금을 찍는 곳은 Astro(입금 현황 · 스팟 제작) 하나이고, 재무는 그 기록을 모아 볼 뿐이다.
 * 계좌가 연결돼 있지 않아 출금은 **사람이 직접 적는다** — 그 장부가 이 파일의 ExpenseItem · ExpenseEntry 다.
 */

export const EXPENSE_CATEGORIES = ["식사권", "인프라", "도구·구독", "마케팅·협찬", "제작", "인건비", "세금·수수료", "기타"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * 출금 방식 — 금액을 어떻게 정하는가. 드롭다운으로 고른다.
 *   FIXED          그냥 출금액: 적은 금액이 곧 나가는 돈.
 *   PER_PAID_STORE 유료 식당 수 × 단가: 적은 금액은 「식당 1곳당 단가」이고, 나가는 돈 = 단가 × 그 달 유료 식당 수.
 * 방식을 더하려면 여기에 키를 하나 더하고 calc.ts 의 resolveAmount 에 한 줄을 더하면 된다.
 */
export type ExpenseMethod = "FIXED" | "PER_PAID_STORE";
export const METHOD_LABEL: Record<ExpenseMethod, string> = { FIXED: "고정 금액", PER_PAID_STORE: "유료 식당 수 × 단가" };
export const METHOD_HINT: Record<ExpenseMethod, string> = {
  FIXED: "적은 금액이 그대로 나갑니다.",
  PER_PAID_STORE: "식당 1곳당 단가를 적으면, 유료 식당 수만큼 곱해 나갈 돈을 계산합니다.",
};

/** 유료 식당 한 곳 — 수를 셀 때 필요한 것만. `start` 는 청구 시작 월(없으면 처음부터 센다). */
export interface PaidStore {
  id: number;
  name: string;
  start: string | null;
}

export type ExpenseCycle = "MONTHLY" | "YEARLY";
export const CYCLE_LABEL: Record<ExpenseCycle, string> = { MONTHLY: "매월", YEARLY: "매년" };

/**
 * 고정 비용 항목 — 「어떤 비용이 나가는가」의 목록.
 * `is_default` 는 처음부터 깔아 둔 기본 항목이다(지우지 않고 쉬게만 한다). 나머지는 사람이 추가한 항목.
 * 금액을 모르면 `null` — 0 원으로 채우지 않는다. 0 은 「무료」, null 은 「아직 모름」이다.
 */
export interface ExpenseItem {
  id: string;
  /** 기본 항목의 고정 이름표. 같은 기본 항목이 두 번 깔리지 않게 하는 열쇠. 직접 추가한 항목은 null. */
  key: string | null;
  name: string;
  category: ExpenseCategory;
  method: ExpenseMethod;
  /** FIXED 면 나가는 금액, PER_PAID_STORE 면 식당 1곳당 단가. 모르면 null. */
  amount: number | null;
  cycle: ExpenseCycle;
  /** 매월 며칠에 나가는가(1~31). 모르면 null. */
  pay_day: number | null;
  /** 이 달부터 나간다 — YYYY-MM */
  start_period: string;
  /** 이 달까지만 나간다 — 없으면 계속 */
  end_period: string | null;
  active: boolean;
  is_default: boolean;
  memo: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

/**
 * 출금 한 건 — 실제로 나간 돈의 기록.
 * `item_id` 가 있으면 고정 비용 항목의 그 달 지급이고, 없으면 한 번 나간 비용이다.
 * `period` 는 **어느 달 몫인가**(귀속 월), `paid_on` 은 **돈이 나간 날**이다. 현금 흐름은 paid_on 으로 센다.
 */
export interface ExpenseEntry {
  id: string;
  item_id: string | null;
  paid_on: string; // YYYY-MM-DD
  period: string; // YYYY-MM
  name: string;
  category: ExpenseCategory;
  amount: number;
  memo: string | null;
  created_by: string | null;
  created_at: string | null;
}

export type IncomeSource = "invoice" | "spot";
export const INCOME_SOURCE_LABEL: Record<IncomeSource, string> = { invoice: "월 이용료", spot: "스팟 제작" };

/** 입금 한 건 — Astro 기록에서 읽은 것. 금액을 모르는 건은 null (합계에 넣지 않는다). */
export interface IncomeEntry {
  id: string;
  paid_on: string; // YYYY-MM-DD
  amount: number | null;
  source: IncomeSource;
  name: string;
  /** "2026년 9월분" 같은 한 줄 설명 */
  detail: string | null;
}
