/**
 * Astro(영업) · Probe(데이터) · Castor(앱 구조) 공용 타입.
 *
 * 서버(route handler)와 클라이언트 컴포넌트가 같은 정의를 보게 한 곳에 모았다.
 * 백엔드 직렬화 필드명과 1:1로 맞춰 두었으므로, Django 시리얼라이저를 만들 때
 * `_backend_changes/{astro,probe,castor}/models.py` 와 이 파일을 나란히 보면 된다.
 */

/* ═══════════ Astro ═══════════ */

/** 입금 상태 — 자동 판정하지 않는다. 사람이 통장을 보고 체크한다 (2026-08-12 팀 합의). */
export type BillingState = "UNKNOWN" | "PENDING" | "PAID" | "EXEMPT";
/** 세금계산서 상태 — 수금(BillingState)과 분리된 별개 상태머신 (ADIT 콘솔 차용). */
export type InvoiceState = "NONE" | "SENT" | "NO_REPLY" | "ISSUED";
export type PlanTier = "FREE" | "BOOST" | "CONTENT";
export type PayCycle = "MONTHLY" | "LUMP";

/** 백엔드 `/api/dashboard/restaurants/` 한 행. 세 라우트가 같은 걸 다시 선언하지 않게 여기 둔다. */
export interface BackendRestaurant {
  restaurant_id: number;
  name: string;
  tier: string | null;
  is_affiliate?: boolean;
}

/** Astro 화면 한 행 = 백엔드 매장 + 운영 필드. */
export interface StoreRow {
  restaurant_id: number;
  name: string;
  tier: string | null;
  is_affiliate: boolean;
  ops: StoreOps | null;
}

export function isPaidTier(t: string | null | undefined): boolean {
  return t === "BOOST" || t === "CONTENT";
}

export const BILLING_LABEL: Record<BillingState, string> = {
  UNKNOWN: "미확인",
  PENDING: "입금 대기",
  PAID: "입금 확인",
  EXEMPT: "해당 없음",
};
export const INVOICE_LABEL: Record<InvoiceState, string> = {
  NONE: "미발송",
  SENT: "발송함",
  NO_REPLY: "미회신",
  ISSUED: "발행 완료",
};

/**
 * 매장 운영 필드 — 기존 `restaurants` 테이블이 갖지 않는, Astro 가 소유하는 값들.
 * 계약 조건(플랜·쿠폰)은 이미 백엔드/시트에 있으므로 여기에 복제하지 않는다.
 */
export interface StoreOps {
  id: number; // = restaurant_id
  semester_active: boolean | null; // 학기 중 플랜 사용
  vacation_active: boolean | null; // 방학 중 플랜 사용 — 점주마다 다르다
  billing: BillingState;
  billing_checked_at: string | null;
  billing_checked_by: string | null;
  invoice: InvoiceState;
  quote_sent_at: string | null; // 견적서 발송
  contract_returned_at: string | null; // 계약서 회수
  kit_delivered: boolean; // 포스터·QR 스티커 등 비치물 전달
  owner_name: string | null;
  owner_phone: string | null;
  biz_no: string | null; // 사업자등록번호
  monthly_fee: number | null;
  pay_cycle: PayCycle | null;
  contract_started_on: string | null;
  contract_months: number | null;
  /** 테스트·시드 매장 플래그. KPI 집계에서 뺀다 (ADIT 콘솔 preseed 49곳 반면교사). */
  is_test: boolean;
  memo: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

/** 운영 행이 아직 없는 매장의 기본값. `null` 은 '아직 아무도 확인하지 않음'이다. */
export function emptyStoreOps(id: number): StoreOps {
  return {
    id,
    semester_active: null,
    vacation_active: null,
    billing: "UNKNOWN",
    billing_checked_at: null,
    billing_checked_by: null,
    invoice: "NONE",
    quote_sent_at: null,
    contract_returned_at: null,
    kit_delivered: false,
    owner_name: null,
    owner_phone: null,
    biz_no: null,
    monthly_fee: null,
    pay_cycle: null,
    contract_started_on: null,
    contract_months: null,
    is_test: false,
    memo: null,
    updated_at: null,
    updated_by: null,
  };
}

/** 클라이언트가 PATCH 로 바꿀 수 있는 운영 필드. 이 밖의 키(id·updated_by 등)는 서버가 버린다. */
export const STORE_OPS_EDITABLE = [
  "semester_active", "vacation_active", "kit_delivered",
  "billing", "invoice", "quote_sent_at", "contract_returned_at",
  "owner_name", "owner_phone", "biz_no",
  "monthly_fee", "pay_cycle", "contract_started_on", "contract_months",
  "is_test", "memo",
] as const satisfies readonly (keyof StoreOps)[];

export const LEAD_EDITABLE = [
  "name", "district", "category", "stage", "owner", "contact", "channel",
  "next_action", "next_action_on", "expected_plan", "memo",
] as const satisfies readonly (keyof Lead)[];

export const LEAD_STAGES = [
  "미컨택",
  "컨택",
  "미팅조율",
  "미팅",
  "제안·견적",
  "계약",
  "입점완료",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number] | "거절";

/**
 * 신규 컨택(입점 후보).
 *
 * ADIT Pitchr 의 핵심 설계를 그대로 가져왔다 — **파이프라인이 계약에서 끝나지 않는다.**
 * "계약"과 "입점완료"(첫 콘텐츠 발행·비치물 전달)를 분리해야 영업이 툴을 갈아타지 않고
 * 자기가 딴 건이 실제로 굴러갔는지 본다.
 */
export interface Lead {
  id: string;
  name: string;
  district: string | null; // 상권 (경대북문 / 정문 …)
  category: string | null;
  stage: LeadStage;
  owner: string | null; // 담당자
  contact: string | null;
  channel: string | null; // 방문 / 전화 / 인스타DM / 소개 / 폼
  next_action: string | null;
  next_action_on: string | null;
  /** 방치 감지의 기준점. 이 값이 오래됐으면 카드가 흐려지고 KPI 에 잡힌다. */
  last_touch_at: string | null;
  expected_plan: PlanTier | null;
  memo: string | null;
  created_at: string;
  converted_restaurant_id: number | null;
}

export type ActivityKind = "메모" | "전화" | "카톡" | "미팅" | "방문";

/** 활동 기록 — Pitchr 리드 상세의 "상시 노출 활동 기록기"를 그대로 가져온 것. */
export interface Activity {
  id: string;
  target_type: "lead" | "store";
  target_id: string;
  kind: ActivityKind;
  body: string;
  author: string;
  created_at: string;
}

/* ═══════════ Probe ═══════════ */

export type QualitySeverity = "high" | "medium" | "low";

/**
 * 데이터 정합성 점검 결과 한 건.
 *
 * 이 화면이 Probe 의 존재 이유다 — 2026-09-05 "지금 제휴 아닌 하카타파스타가 튜토리얼에
 * 뜬다", 2026-09-10 "튜토리얼 쿠폰이 실제 쿠폰과 다르다" 같은 사고가 반복됐고, 전부
 * **사람이 눈으로 볼 때까지 아무도 몰랐다**. 규칙으로 박아두면 화면이 먼저 말한다.
 */
export interface QualityIssue {
  id: string;
  severity: QualitySeverity;
  rule: string; // 규칙 코드 — 슬랙 알림·이력 추적용
  title: string;
  subject: string; // 대상 (식당명 등)
  detail: string;
  hint: string; // 어떻게 고치나
  source: string; // 어느 데이터를 비교해서 나온 판정인지
}

export interface StoreMetric {
  restaurant_id: number;
  name: string;
  tier: PlanTier | null;
  is_affiliate: boolean;
  revisit_this_month: number;
  loyal_total: number;
  coupon_redeemed_this_month: number;
  stamp_earned_this_month: number;
  /** 지표를 못 읽은 매장. 0 과 구분해야 한다 — 0 은 사실이고 null 은 모름이다. */
  unavailable?: boolean;
}

/* ═══════════ Castor ═══════════ */

export interface CastorScreen {
  id: string;
  route: string;
  file: string;
  title: string;
  layout?: string | null;
  blocks: string[];
}
export interface CastorEdge {
  from: string;
  to: string;
  trigger: string;
  kind: "Link" | "router.push" | "router.replace" | "redirect" | "manual";
}
export interface CastorGuard {
  match: string;
  rule: string;
  from: string;
}
export interface CastorGraph {
  version: string;
  source: { repo: string; commit: string; framework: string };
  generated_at: string;
  screens: CastorScreen[];
  edges: CastorEdge[];
  guards: CastorGuard[];
  /** 정적 분석으로 못 잡은 이동 수. 숨기지 않고 화면에 띄운다. */
  unresolved?: number;
  parsed_from?: "build-manifest" | "glob";
}

export interface CastorVariant {
  key: string;
  name: string;
  weight: number;
  blocks: string[];
}
export interface CastorExperiment {
  id: string;
  hypothesis: string;
  target: { screen: string; audience: string };
  variants: CastorVariant[];
  metric: { primary: string; guard: string[] };
  period: { from: string; days: number };
  status: "draft" | "running" | "done" | "abandoned";
  source: { commit: string };
  created_by: string;
  created_at: string;
}
