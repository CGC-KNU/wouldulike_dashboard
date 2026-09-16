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
/** 캠퍼스 — 상권 위의 축. 팀이 경북대 마무리 → 영남대·계명대 컨택으로 나뉘어 뛴다 (0901·0906). */
/** 기본 캠퍼스. **열린 목록**이다 — 새 대학에 들어가면 화면에서 바로 추가한다 (민열님 0911). */
export const CAMPUSES = ["경북대", "영남대", "계명대"] as const;

/**
 * 카테고리 — **앱이 쓰는 목록 그대로** (백엔드 appconfig/defaults.py).
 * 여기서 다른 말을 만들면 앱 화면과 영업 화면이 다른 분류를 쓰게 되고,
 * 나중에 "돈가스는 어느 쪽이 맞나"를 사람이 매번 판단해야 한다.
 */
export const APP_CATEGORIES = ["한식", "중식", "일식", "양식", "분식", "술집", "카페", "돈가스", "햄버거", "기타"] as const;

/**
 * 제안 플랜 — 우리가 파는 세 가지. 금액은 여기 적지 않는다(캠퍼스마다 다르다, pricing.ts).
 * 자유 입력이던 시절의 "Boost 3만" 같은 값도 그대로 남아 있어서, 화면은 목록에 없는 값도 보여 준다.
 */
export const PROPOSED_PLANS = ["Free", "Boost", "Premium"] as const;

export type Campus = string;

export interface StoreOps {
  id: number; // = restaurant_id
  campus: Campus | null;
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
  /** 세금계산서를 받을 주소. 볼타는 공급받는자 이메일이 **필수**라 이게 비면 발행이 거절된다 (0915). */
  owner_email: string | null;
  biz_no: string | null; // 사업자등록번호
  monthly_fee: number | null;
  pay_cycle: PayCycle | null;
  contract_started_on: string | null;
  contract_months: number | null;
  /** 청구를 시작하는 달 "YYYY-MM". 월 중간에 들어온 매장은 이번 달/다음 달 중 고른다 (민열님 0911). null 이면 계약 시작월. */
  billing_start_period: string | null;
  /** 네이버지도/카카오맵 링크와 지도상 공식 상호 — 팀원과 툴이 같은 이름을 쓴다 (민열님 0911). */
  map_url: string | null;
  map_name: string | null;
  /* ── 시트 '계약 세부사항' 열 1:1. 툴이 시트를 대체하므로 전부 편집 가능하다 (민열님 0910). ── */
  district: string | null; // 상권 (시트 '매장 현황' C열)
  contract_signed_on: string | null; // 계약일
  contract_ends_on: string | null; // 전체 계약기간 끝
  coupon_basic: string | null; // 기본 쿠폰 (상시)
  coupon_limited: string | null; // 한정 쿠폰
  stamp_count: string | null; // 스탬프 적립 개수 "5 / 10 / 20"
  stamp_reward: string | null; // 스탬프 혜택
  exclusions: string | null; // 식사권 제외 메뉴·시간대
  extra_quote: string | null; // 별도 견적 항목
  kit_note: string | null; // 홍보물 수령 "2장/10장"
  pin: string | null;
  contract_original: string | null; // 계약서 원본 보관
  sheet_owner: string | null; // 담당자
  /** 마지막으로 시트에서 읽어온 시각. 이후 툴에서 고친 값이 원본이다. */
  sheet_synced_at: string | null;
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
    campus: null,
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
    owner_email: null,
    biz_no: null,
    monthly_fee: null,
    pay_cycle: null,
    contract_started_on: null,
    contract_months: null,
    billing_start_period: null,
    map_url: null,
    map_name: null,
    district: null,
    contract_signed_on: null,
    contract_ends_on: null,
    coupon_basic: null,
    coupon_limited: null,
    stamp_count: null,
    stamp_reward: null,
    exclusions: null,
    extra_quote: null,
    kit_note: null,
    pin: null,
    contract_original: null,
    sheet_owner: null,
    sheet_synced_at: null,
    is_test: false,
    memo: null,
    updated_at: null,
    updated_by: null,
  };
}

/** 클라이언트가 PATCH 로 바꿀 수 있는 운영 필드. 이 밖의 키(id·updated_by 등)는 서버가 버린다. */
export const STORE_OPS_EDITABLE = [
  "campus", "semester_active", "vacation_active", "kit_delivered",
  "billing", "invoice", "quote_sent_at", "contract_returned_at",
  "owner_name", "owner_phone", "owner_email", "biz_no",
  "monthly_fee", "pay_cycle", "contract_started_on", "contract_months", "billing_start_period", "map_url", "map_name",
  "district", "contract_signed_on", "contract_ends_on", "coupon_basic", "coupon_limited", "stamp_count", "stamp_reward",
  "exclusions", "extra_quote", "kit_note", "pin", "contract_original", "sheet_owner", "sheet_synced_at",
  "is_test", "memo",
] as const satisfies readonly (keyof StoreOps)[];

export const LEAD_EDITABLE = [
  "name", "campus", "kind", "district", "category", "stage", "owner", "intent", "owner_name", "phone", "contact",
  "link", "insta", "channel", "contacted_at", "meeting_at", "attendees", "proposed_plan",
  "next_action", "due", "grade", "score", "angle", "memo",
] as const satisfies readonly (keyof Lead)[];

/**
 * 입점 후보 단계 — **팀 시트 '매장 현황' 탭의 단계 드롭다운을 그대로** 쓴다.
 * 툴이 새 어휘를 만들면 시트와 툴 사이에 번역이 생기고, 번역이 생기면 아무도 둘 다 안 믿는다.
 *
 * 앞 7개가 파이프라인(왼→오른쪽), 뒤 3개는 옆으로 빠진 상태(재컨택·보류·거절).
 */
export const LEAD_STAGES = ["미컨택", "컨택 중", "미팅 조율", "미팅 예정", "미팅 완료", "구두 합의", "계약 완료"] as const;
/** 파이프라인에 서는 단계 — **계약 완료는 빠진다.**
 *  계약이 되면 후보가 아니라 파트너 매장이 된다(「제휴 매장으로 등록」). 후보 목록에 남겨 두면
 *  '진행 중'이 계속 부풀고, 매장 목록과 후보 목록 양쪽에 같은 가게가 선다. (2026-09-16 팀 결정) */
export const LEAD_OPEN_STAGES = ["미컨택", "컨택 중", "미팅 조율", "미팅 예정", "미팅 완료", "구두 합의"] as const;
export const LEAD_SIDE_STAGES = ["재컨택", "보류", "거절"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number] | (typeof LEAD_SIDE_STAGES)[number];
export const ALL_LEAD_STAGES: readonly LeadStage[] = [...LEAD_STAGES, ...LEAD_SIDE_STAGES];

/** 유료화 의향 — 시트 H열. */
export type LeadIntent = "A" | "B" | "C" | "D";
export const INTENT_LABEL: Record<LeadIntent, string> = { A: "가능성 높음", B: "가능성 있음", C: "가능성 적음", D: "가능성 없음" };

/**
 * 입점 후보. 열은 시트 '매장 현황'·'신규 컨택'·'후보 실측' 탭의 합집합이다.
 * 시트가 지금 실제로 쓰는 도구라서, 툴은 시트를 대체하기 전까지 시트의 열을 잃으면 안 된다.
 */
export interface Lead {
  id: string;
  name: string;
  campus: Campus | null; // 경북대 · 영남대 · 계명대
  kind: "기존 파트너" | "신규" | null; // 시트 F열 '구분'
  district: string | null; // 상권
  category: string | null;
  stage: LeadStage;
  owner: string | null; // 담당자
  intent: LeadIntent | null; // 유료화 의향
  owner_name: string | null; // 대표자
  phone: string | null; // 매장 전화
  contact: string | null; // 대표 연락처
  link: string | null; // 네이버 플레이스 등
  insta: string | null; // 인스타 계정
  channel: string | null; // 유입 경로
  contacted_at: string | null; // 컨택 일시
  meeting_at: string | null; // 미팅 일시
  attendees: string | null; // 미팅 참석자
  proposed_plan: string | null; // 제안 플랜 (시트 원문: "Boost 3만" 등)
  next_action: string | null;
  due: string | null; // 기한
  /** 방치 감지의 기준점. 단계를 옮기거나 활동을 기록하면 갱신된다. */
  last_touch_at: string | null;
  /** 후보 실측 탭(0909)의 판정 블록. 없으면 null. */
  grade: "A" | "B" | "C" | null;
  score: number | null;
  angle: string | null; // 공략 포인트
  memo: string | null;
  source: "manual" | "sheet:현황" | "sheet:신규" | "sheet:후보" | "sheet:후보계명" | "paste";
  created_at: string;
  converted_restaurant_id: number | null;
}

export type ActivityKind = "메모" | "전화" | "문자" | "카톡" | "미팅" | "방문";

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

/**
 * 자료실 — 계약·영업 과정에서 바로 내려받아 쓰는 파일 (Pitchr 자료실 차용).
 * 파일 본체는 여기 두지 않는다. 이 레포는 공개 GitHub 라 계약서를 넣으면 안 된다.
 * 드라이브/S3 링크를 등록하고, 툴은 "무엇을 언제 쓰나"를 같이 보여준다.
 */
export type DocKind = "계약서" | "제안서" | "소개서" | "견적서" | "안내문" | "전단" | "포스터" | "기타";
export const DOC_KINDS: DocKind[] = ["계약서", "제안서", "소개서", "견적서", "안내문", "전단", "포스터", "기타"];

export interface SalesDoc {
  id: string;
  kind: DocKind;
  title: string;
  version: string | null; // "v6", "11P"
  url: string | null; // 드라이브/S3. 없으면 '링크 등록 필요'
  when: string | null; // 언제 쓰나 (영업 단계)
  note: string | null;
  updated_at: string;
  updated_by: string | null;
}

/** 상호·사업자등록번호는 빠져 있다 — 사업자등록증 값이라 화면에서 안 고친다 (0915). */
export const ISSUER_EDITABLE = ["ceo", "address", "bank_name", "bank_account", "bank_holder", "bolta_customer_key", "item_template", "approver", "slack_channel"] as const satisfies readonly (keyof IssuerSettings)[];

export const DOC_EDITABLE = ["kind", "title", "version", "url", "when", "note"] as const satisfies readonly (keyof SalesDoc)[];

/**
 * 세금계산서 — 애딧 '세발'(sebal.adit.now) 상태머신을 그대로 가져왔다 (0830 분석).
 * 국세청 발행은 되돌리기 어려운 외부 부작용이라 발행 앞에 승인 단계와 경고를 두고, 응답이 애매하면
 * RESULT_UNKNOWN 으로 멈춰 사람이 볼타 대시보드를 보게 한다. 이 "멈춤"이 없으면 재시도 클릭이 이중 발행을 만든다.
 */
export type TaxInvoiceStatus = "PENDING" | "APPROVED" | "ISSUING" | "ISSUED" | "FAILED" | "RESULT_UNKNOWN" | "REJECTED" | "CANCELED";
export const TAX_STATUS_LABEL: Record<TaxInvoiceStatus, string> = {
  PENDING: "품의", APPROVED: "승인", ISSUING: "발행 중", ISSUED: "발행 완료", FAILED: "발행 실패", RESULT_UNKNOWN: "결과 불명", REJECTED: "반려", CANCELED: "취소",
};

export interface TaxInvoice {
  id: string;
  restaurant_id: number;
  name: string; // 매장명 (공급받는자 상호)
  title: string; // "우주라이크 파트너 플랜 2026년 9월분"
  period: string; // "2026-09"
  supply: number; // 공급가액
  tax: number; // 세액
  total: number;
  tax_type: "TAXABLE" | "TAX_FREE" | "ZERO_RATE";
  receipt_type: "RECEIPT" | "CLAIM"; // 영수 / 청구
  write_date: string; // 작성일자
  counterparty: { biz_no: string | null; ceo: string | null; email: string | null; phone: string | null };
  status: TaxInvoiceStatus;
  requested_by: string;
  requested_at: string;
  approved_by: string | null;
  approved_at: string | null;
  issued_at: string | null;
  nts_no: string | null; // 국세청 승인번호
  bolta_key: string | null;
  url: string | null; // 세금계산서 보기
  fail_code: string | null;
  attempts: number;
  reject_reason: string | null;
  paid_at: string | null; // 입금 확인 → StoreOps.billing 과 동기화
  memo: string | null;
}

/** 발행 주체 설정 — Console '세금계산서(볼타) 설정' 화면. 우주라이크는 발행 주체가 하나(개인사업자 코끼리)라 선택 UI 없이 설정값이다. */
export interface IssuerSettings {
  name: string;
  biz_no: string;
  ceo: string;
  address: string;
  email: string;
  /** 입금 계좌 — 계약 완료 안내 문자에 들어간다. 코드에 박지 않고 여기서만 관리한다(0914). */
  bank_name: string;
  bank_account: string;
  bank_holder: string;
  bolta_customer_key: string | null;
  /** 서버에 볼타 열쇠가 있는가. '발행하기' 버튼은 설정 칸이 아니라 이 값으로 켜진다. */
  bolta_ready?: boolean;
  /** test_ 로 시작하는 키인가 — 실발행과 구분해서 화면에 적는다. */
  bolta_test?: boolean;
  /** 공동인증서 만료 — 사람이 받아 적던 칸. 이제 볼타에 직접 묻는다(설정 → 공동인증서). 옛 값만 남아 있다. */
  cert_expires_at: string | null;
  item_template: string; // "우주라이크 파트너 플랜 {period}분"
  approver: string; // 승인자 (대표)
  slack_channel: string;
  updated_at: string | null;
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

/* ═══════════ Probe · 매장 리포트 (점주에게 보내는 공개 링크) ═══════════ */

/** LINKED = 링크는 있는데 아직 안 보냄. SENT 는 사람이 "보냈음"을 체크한 것 — 발급 ≠ 발송. */
export type ReportStatus = "DRAFT" | "APPROVED" | "LINKED" | "SENT" | "REVOKED";

/** 지표 한 칸 — 값 + 코호트(우리 채널 평소 게시물). 표본이 작으면 delta 는 null 이고 화면은 막대를 안 그린다. */
export interface ReportMetric {
  key: string;
  value: number;
  median: number | null;
  p10: number | null;
  p90: number | null;
  n: number;
  window_days: number | null;
  hidden: boolean;
  delta_pct: number | null;
}

export interface ReportProposal {
  rule: string; // P1..P9
  title: string;
  generated_text: string; // 기계가 쓴 원문 — 템플릿 개선용으로 보관
  text: string; // 사람이 고친 본문
  approved: boolean;
  edited_by: string | null;
  edited_at: string | null;
}

/**
 * 스냅샷 — 만든 순간의 값만, 화이트리스트로. StoreOps 를 통째로 넣지 않는다(연락처·PIN·사업자번호가 공개 URL 에 실린다).
 */
export interface ReportSnapshot {
  store: { name: string; campus: Campus | null };
  post: { plan_id: number; topic: string; posted_at: string | null; permalink: string | null; format: string | null; caption: string | null; cover_url: string | null; owner_name: string | null; co_stores: number };
  as_of: string; // ISO — "○시 기준"
  basis: "D7" | "cumulative" | null;
  age_days: number | null;
  collecting: boolean;
  metrics: ReportMetric[];
  cohort_note: string | null; // "최근 90일 게시물 30건 기준"
  app: { month: string; coupon_redeemed: number; stamp_earned: number; revisit: number; loyal_total: number } | null;
}

export interface StoreReport {
  id: string;
  token: string | null; // 40자 hex — 링크 발급 때 생긴다. 재발급하면 바뀐다.
  restaurant_id: number;
  plan_id: number;
  kind: "post"; // 월간 리포트는 2차
  status: ReportStatus;
  title: string;
  summary: string; // 한 줄 요약 (편집 가능)
  interpretation: string[]; // 비교 해석 문장 (편집 가능)
  snapshot: ReportSnapshot;
  proposals: ReportProposal[];
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  linked_at: string | null;
  sent_at: string | null;
  revoked_at: string | null;
  views: { count: number; first_at: string | null; last_at: string | null };
}
