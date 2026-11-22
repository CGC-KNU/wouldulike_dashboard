/**
 * 재무 — 타입.
 *
 * 입금은 **읽기 전용**이다. 입금을 찍는 곳은 Astro(입금 현황 · 스팟 제작) 하나이고, 재무는 그 기록을 모아 볼 뿐이다.
 * 계좌가 연결돼 있지 않아 출금은 **사람이 직접 적는다** — 그 장부가 이 파일의 ExpenseItem · ExpenseEntry 다.
 * 런웨이를 내려면 장부만으로는 모자라 두 가지를 더 적는다 — 계좌별 월말 잔고(AccountBalance)와 자금 조달(FundingEvent).
 * 원본은 백엔드 AdminConfig 문서 `finance:ledger`(astro/finance.py)다.
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
  /** Astro 운영값의 캠퍼스(경북대 · 영남대 · 계명대) — 상권 침투율용. 모르면 null. */
  campus?: string | null;
}

export type ExpenseCycle = "MONTHLY" | "YEARLY";
export const CYCLE_LABEL: Record<ExpenseCycle, string> = { MONTHLY: "매월", YEARLY: "매년" };

/**
 * 행동 방식 — 매출 · 매장 수가 바뀔 때 이 비용이 어떻게 움직이는가(설계 04절). 항목에만 매기고 출금 한 건에서는 못 바꾼다.
 * 출금 방식(FIXED · PER_PAID_STORE)과 다르다: 그건 금액을 정하는 법이고, 이건 비용의 성격이다.
 */
export type ExpenseBehavior = "FIXED" | "VARIABLE" | "SEMI_VARIABLE" | "ONE_OFF";
export const BEHAVIORS: ExpenseBehavior[] = ["FIXED", "VARIABLE", "SEMI_VARIABLE", "ONE_OFF"];
export const BEHAVIOR_LABEL: Record<ExpenseBehavior, string> = { FIXED: "고정", VARIABLE: "변동", SEMI_VARIABLE: "준변동", ONE_OFF: "일회성" };

/** 회계 위치 — 손익에서 어느 줄에 가는가. PG 수수료 · 호스팅을 COGS 에 넣을지는 표준이 없어 한 번 정해 고정한다. */
export type ExpenseAccount = "COGS" | "S&M" | "R&D" | "G&A";
export const ACCOUNTS: ExpenseAccount[] = ["COGS", "S&M", "R&D", "G&A"];
export const ACCOUNT_LABEL: Record<ExpenseAccount, string> = { COGS: "COGS · 매출원가", "S&M": "S&M · 판매·마케팅", "R&D": "R&D · 개발", "G&A": "G&A · 일반관리" };

/**
 * 반복 항목 — 「어떤 비용이 나가는가」의 목록(전에는 「고정 비용 항목」이라 불렀지만 식사권처럼 변동비도 섞여 있다).
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
  /** 행동 방식 · 회계 위치 — 모르면 null(미분류). */
  behavior: ExpenseBehavior | null;
  account: ExpenseAccount | null;
  active: boolean;
  is_default: boolean;
  memo: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

/**
 * 출금 한 건 — 실제로 나간 돈의 기록.
 * `item_id` 가 있으면 반복 항목의 그 달 지급이고, 없으면 한 번 나간 비용이다.
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
  /** 매입 세액(1122) — 부가세 순납부 = 받은 세액 − 이것. 옛 기록 · 모름은 없음(null). */
  tax?: number | null;
  /** 선택 태그(1122) — 입점(매장 1곳 들일 때 한 번 드는 돈) · 상권 진입(새 상권 열 때). 없으면 태그 없음. */
  tag?: EntryTag | null;
  /** 입점 태그일 때 어느 매장인지(고르면) */
  store_id?: number | null;
  /** 상권 태그일 때 어느 상권인지(필수) · 입점 태그면 선택 */
  campus?: string | null;
}

export type EntryTag = "onboarding" | "campus";
export const ENTRY_TAGS: EntryTag[] = ["onboarding", "campus"];
export const ENTRY_TAG_LABEL: Record<EntryTag, string> = { onboarding: "입점", campus: "상권 진입" };
export const CAMPUSES = ["경북대", "영남대", "계명대"] as const;

export type IncomeSource = "invoice" | "spot";
export const INCOME_SOURCE_LABEL: Record<IncomeSource, string> = { invoice: "월 이용료", spot: "스팟 제작" };

/**
 * 입금 한 건 — Astro 기록에서 읽은 것. 금액을 모르는 건은 null (합계에 넣지 않는다).
 * `amount` 는 통장에 들어온 돈(세금계산서면 공급가 + 세액), `supply` 는 매출로 세는 공급가, `tax` 는 다음 납부 때 나갈 부가세다.
 * 스팟 제작은 가격 한 칸뿐이라 세액을 모른다(null) — 공급가 = 가격으로 본다.
 */
export interface IncomeEntry {
  id: string;
  paid_on: string; // YYYY-MM-DD
  amount: number | null;
  supply: number | null;
  tax: number | null;
  source: IncomeSource;
  name: string;
  /** "2026년 9월분" 같은 한 줄 설명 */
  detail: string | null;
}

/**
 * 구독 청구 한 줄 — MRR 계산용. 발행됐거나 입금된 세금계산서(취소 · 반려 제외)를 귀속 월(period부터 months개월)로 편다.
 * 입금 여부와 무관하다: MRR 은 청구 기준이다.
 */
export interface BillingLine {
  id: string;
  restaurant_id: number;
  period: string; // YYYY-MM — 첫 달
  months: number;
  supply: number;
}

/**
 * 계좌별 월말 잔고 — 통장을 보고 사람이 적는다. 장부(입금 − 출금 + 조달)로 굴린 잔고와 1만 원 넘게 다르면 「대사 필요」.
 * `reconciled_by` 는 「통장과 맞춰 봤음」을 켠 사람 — 서버가 찍는다.
 */
export interface AccountBalance {
  id: string;
  account_name: string;
  last4: string | null;
  amount: number;
  as_of: string; // YYYY-MM-DD 기준일
  period: string; // YYYY-MM — as_of 의 달
  reconciled: boolean;
  reconciled_by: string | null;
  reconciled_at: string | null;
  memo: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

/**
 * 자금 조달 — SAFE · 지원금 · 상금 · 대출. 영업 유입이 아니라서 **순번에 넣지 않는다.**
 * 상태는 예정 → 확정 → 입금. 「입금」만 잔고에 들어간 돈으로 본다(장부 잔고 계산). 예정 · 확정은 기다리는 돈이다.
 * 지원금처럼 쓸 곳이 정해진 돈(`restricted`)은 가용 현금에서 뺀다 — 남은 전용 잔액(`restricted_left`)을 모르면 금액 전체.
 */
export type FundingKind = "SAFE" | "GRANT" | "PRIZE" | "LOAN";
export const FUNDING_KINDS: FundingKind[] = ["SAFE", "GRANT", "PRIZE", "LOAN"];
export const FUNDING_KIND_LABEL: Record<FundingKind, string> = { SAFE: "SAFE", GRANT: "지원금", PRIZE: "상금", LOAN: "대출" };
export type FundingStatus = "PLANNED" | "CONFIRMED" | "RECEIVED";
export const FUNDING_STATUSES: FundingStatus[] = ["PLANNED", "CONFIRMED", "RECEIVED"];
export const FUNDING_STATUS_LABEL: Record<FundingStatus, string> = { PLANNED: "예정", CONFIRMED: "확정", RECEIVED: "입금" };

export interface FundingEvent {
  id: string;
  kind: FundingKind;
  status: FundingStatus;
  name: string;
  amount: number | null;
  expected_on: string | null;
  received_on: string | null;
  restricted: boolean;
  restricted_left: number | null;
  spend_deadline: string | null;
  memo: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

/* ═══════════ 재무 지표(1122) — 백엔드 /api/finance/records/ 와 그 둘레에서 모은 것 ═══════════ */

export type ChurnReason = "CLOSED" | "VOLUNTARY" | "PAYMENT_FAILED" | "OTHER";
export const CHURN_REASONS: ChurnReason[] = ["CLOSED", "VOLUNTARY", "PAYMENT_FAILED", "OTHER"];
export const CHURN_REASON_LABEL: Record<ChurnReason, string> = { CLOSED: "폐업", VOLUNTARY: "자발", PAYMENT_FAILED: "결제 실패", OTHER: "기타" };

/** 해지 한 줄(astro:churn) — 계약 종료 때 남긴다. `start` 는 그 매장의 유료 시작 월(해지 뒤엔 다시 셀 수 없어 같이 남긴다). */
export interface ChurnRow { restaurant_id: number; ended_on: string; reason: ChurnReason; start: string | null; tier: string | null; memo?: string | null; by?: string; at?: string }
/** 플랜 변경 한 줄(astro:plan_history) — 2026-11-22 부터 쌓인다. from 이 null 이면 처음 정한 플랜. */
export interface PlanChange { restaurant_id: number; from: string | null; to: string; at: string; by?: string }

export type PlanCostKey = "FIXED" | "SEMI_VARIABLE" | "VARIABLE" | "ONE_OFF";
export interface PlanMonth { period: string; revenue: number | null; cost: Partial<Record<PlanCostKey, number | null>> }
/** 런웨이 모델 계획값(finance:plan) — 실적 · 계획 숫자라 백엔드에만 있다. */
export interface PlanDoc { version?: string | null; scenario?: string | null; note?: string | null; months: PlanMonth[]; updated_at?: string }

export interface MarketFigure { value: number | null; basis?: string | null; source?: string | null; confirmed?: boolean }
/** 시장 규모(finance:market) — 정본 확정 전이면 confirmed=false. */
export interface MarketDoc { tam?: MarketFigure; sam?: MarketFigure; som?: MarketFigure; boost_annual?: number | null; sam_sidos?: string[]; note?: string | null; updated_at?: string }

export interface FinanceRecords {
  /** 달 → 영업에 쓴 분(후보 · 매장) */
  sales_minutes: Record<string, { lead: number; store: number }>;
  /** 영업 시간 기록이 처음 쌓인 날 — 없으면 null(기록 시작 전) */
  sales_since: string | null;
  churn: ChurnRow[];
  plan_history: PlanChange[];
  settings: { hour_rate: number };
  plan: PlanDoc | null;
  market: MarketDoc | null;
}

/** 학기 목표 표(home:goals) — 메인 「목표 보기」와 같은 문서 */
export interface GoalsDoc { columns: string[]; focus: number; rows: { key: string; label: string; values: string[]; target: number | null; unit: string }[] }

/** 허블 상권 요약 — 침투율 · TAM/SAM 재계산용 숫자만(매장 원장은 싣지 않는다) */
export interface HubbleSummary { campuses: { campus: string; n: number }[]; total: number; count: number; bySido: Record<string, number> }

export interface MetricsInputs {
  records: FinanceRecords | null;
  goals: GoalsDoc | null;
  /** 후보 단계별 수 — 못 읽으면 null */
  funnel: Record<string, number> | null;
  /** 제휴 중인 무료 매장 — 전환율 분모 · 침투율(파트너)용 */
  free: { id: number; campus: string | null }[] | null;
  hubble: HubbleSummary | null;
  draft: boolean;
}
