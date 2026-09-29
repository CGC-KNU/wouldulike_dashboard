/**
 * 견적서 — 발급할 때마다 바뀌는 값과 그 기본값 (0929 민열님 요청).
 *
 * 문구의 기준은 **온보딩 약관 v4**(src/lib/onboard/contract.ts)다. 8/30 매장별 견적서는 종이 계약
 * (26-2학기 6개월 고정·일시납)을 전제로 했지만, 지금 새로 들어오는 매장은 온보딩으로 계약한다 —
 * 기간의 정함 없음 · 월 단위 · 개시일은 다음 달 1일 · 최소 1개월. 그래서 일시납 칸을 없앴다.
 *
 * contract.ts 는 node:crypto 를 불러 브라우저에서 못 쓴다. 가격 규칙만 여기에 같은 값으로 둔다
 * (경북대 Boost 30,000 / 그 외 45,000 / Premium 80,000 — 0919 확정). 바뀌면 두 곳을 같이 고친다.
 */

export type QuotePlan = "FREE" | "BOOST" | "PREMIUM";

export const PLAN_NAME: Record<QuotePlan, string> = { FREE: "무료", BOOST: "Boost", PREMIUM: "Premium" };

/** 플랜 설명 기본 문구 — 사장님 플랜 화면(owner/plan)과 약관 제4조에서 가져왔다. 발급 화면에서 고칠 수 있다. */
export const PLAN_DESC: Record<QuotePlan, string> = {
  FREE: "앱 매장 정보 상시 게재 · 기본 쿠폰·스탬프 운영 · 마일리지 추첨 참여 · 포스터 1종·QR 스티커 2매",
  BOOST: "무료 전체 + 캠페인(한정 쿠폰) 편입(개시일부터 60일 이내 1회 이상) · 캠페인 회차마다 앱 배너·푸시 · 월 1회 이상 앱 배너 · 학생회 채널 배포 요청",
  PREMIUM: "Boost 전체 + 인스타그램 단독 콘텐츠 월 1건 · 고정 알림·배너 노출",
};

export function planFromTier(tier: string | null | undefined): QuotePlan {
  if (tier === "CONTENT" || tier === "PREMIUM") return "PREMIUM";
  if (tier === "BOOST") return "BOOST";
  return "FREE";
}

export function defaultQuoteFee(plan: QuotePlan, campus: string | null | undefined): number {
  if (plan === "FREE") return 0;
  if (plan === "PREMIUM") return 80000;
  return campus === "경북대" ? 30000 : 45000;
}

/* ── 날짜 (서울 기준, "YYYY-MM-DD") ── */
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todaySeoul = () => { const t = new Date(Date.now() + 9 * 3600 * 1000); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
export const addDays = (base: string, n: number) => { const [y, m, d] = base.split("-").map(Number); return iso(new Date(y, m - 1, d + n)); };
/** 발급일이 속한 달의 다음 달 1일 — 약관 제2조의 개시일 규칙 */
export const nextMonthFirst = (base: string) => { const [y, m] = base.split("-").map(Number); return iso(new Date(y, m, 1)); };
/** 개시일 + 1개월 - 1일 = 최소 이용기간 만료일 */
export function minTermTo(starts: string): string {
  const [y, m, d] = starts.split("-").map(Number);
  const t = new Date(y, m, 1);
  t.setDate(Math.min(d, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  t.setDate(t.getDate() - 1);
  return iso(t);
}
export const kdate = (s: string) => { if (!s) return "—"; const [y, m, d] = s.split("-"); return `${y}년 ${Number(m)}월 ${Number(d)}일`; };
export const dotDate = (s: string) => { if (!s) return "—"; const [y, m, d] = s.split("-"); return `${y}. ${Number(m)}. ${Number(d)}`; };
export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 견적번호 — WJ-발급일(YYMMDD)-매장번호. 같은 날 같은 매장을 다시 뽑으면 같은 번호(=같은 견적의 재출력). */
export const quoteNo = (issued: string, rid: number | null) => `WJ-${issued.replaceAll("-", "").slice(2)}-${rid ?? "000"}`;

/** 견적서 한 장을 그리는 데 필요한 값 전부. 매장·플랜·날짜가 바뀌면 이 값만 바뀐다. */
export interface QuoteValues {
  no: string;
  issued_on: string;
  valid_to: string;
  store_name: string;
  owner_name: string;
  biz_no: string;
  campus: string;
  plan: QuotePlan;
  plan_desc: string;
  fee: number; // 공급가액(부가세 별도)
  starts_on: string;
  coupon_basic: string;
  coupon_limited: string;
  stamp: string;
  exclusions: string;
  note: string;
}

export interface IssuerInfo {
  name: string; ceo: string; biz_no: string; address: string; email: string;
  bank_name: string; bank_account: string; bank_holder: string;
}

/** 발행 주체 설정이 비었을 때의 표기 — 계약서(contract.ts)의 회사 줄과 같은 값. 계좌는 설정값만 쓴다(레포에 두지 않음). */
export const ISSUER_FALLBACK: IssuerInfo = {
  name: "코끼리", ceo: "노재민", biz_no: "268-11-03292", address: "대구광역시 북구 대학로 80, 글로벌플라자 101호", email: "coggiri629@gmail.com",
  bank_name: "", bank_account: "", bank_holder: "",
};
