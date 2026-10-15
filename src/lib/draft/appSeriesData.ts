import type { Ga4AppMetrics } from "@/lib/bigquery/appMetrics";
import { eventCoverage, FOLLOW_DAYS, type CouponFunnel, type CouponUseFunnel, type StoreToCoupon } from "@/lib/bigquery/couponFunnel";
import { detailSessions, SMALL_SAMPLE, type PeriodStats } from "./appReportData";
import { dashed, type Bucket, type RangeSpec, type RangeUnit } from "./appRange";

/**
 * Probe · 앱 지표 **기간 × 단위** 표의 데이터 변환 — 칸마다 읽어 온 값을 지표 행으로 바꾼다(민찬 1015).
 * 「지표 보고서 원본」(표 · CSV)과 「주요 지표 보고서」(그래프)가 같은 행을 읽는다.
 *
 * 여기는 **순수 함수만** 둔다(가져오기는 appSeries.ts) — 그래야 테스트가 돈다.
 *
 * 규칙은 주간 보고서(appReportData)와 같다.
 *  - 없는 칸은 0 으로 채우지 않는다. 왜 없는지(`why`)를 짧게 적는다 — 못 읽음 · 이벤트 없던 기간 · 발급 없음 · 일 단위 없음.
 *  - 비율에는 분모(`n`)를 붙이고, 표본이 30 미만이면 흐리게 그린다(`weak`).
 *  - 이벤트가 나중에 생긴 칸은 창이 그 전에 걸치면 값을 내지 않는다(coverage) — 8월 「쿠폰함 → 사용 화면」 4.3% 사고.
 */

export type SeriesSource = "ga4" | "firebase" | "backend" | "push";
/** count = 건수(칸을 더할 수 있다) · avg = 평균 · rate = 비율(%) */
export type SeriesKind = "count" | "avg" | "rate";

export interface Cell {
  v: number | null;
  /** 값이 없는 이유, 또는 값에 붙는 주의 — 짧게 */
  why?: string;
  /** 비율의 분모 */
  n?: number;
  /** 표본이 얕거나 아직 지켜보는 중 — 흐리게 그린다 */
  weak?: boolean;
}

export interface SeriesRow {
  key: string;
  label: string;
  unit: string;
  source: SeriesSource;
  kind: SeriesKind;
  /** 정의 한 줄 — 표 아래 「지표 정의」와 CSV 에 들어간다 */
  note: string;
  /** 위 줄을 쪼갠 줄(└) */
  sub?: boolean;
  cells: Cell[];
  total: Cell;
}

export interface SeriesGroup {
  key: string;
  title: string;
  rows: SeriesRow[];
}

/** 칸 하나에서 읽어 온 것. 못 읽었으면 null — 0 이 아니다 */
export interface CellInput {
  ga4: Ga4AppMetrics | null;
  coupons: CouponFunnel | null;
  s2c: StoreToCoupon | null;
  use: CouponUseFunnel | null;
  /** app-stats/period. 「기간 전체」 열에서는 비율(coupon_redeem_rate)만 쓴다 — 건수는 칸의 합이다 */
  db: PeriodStats | null;
  /** 그 칸이 GA4 확정 테이블보다 뒤에서 시작한다 — 읽지 않았다(「집계 전」) */
  ga4Pending?: boolean;
}

export interface SeriesBucket extends Bucket {
  /** 아직 안 끝난 칸 — GA4 는 확정 테이블까지, DB 는 지금까지 센 값이다 */
  open: boolean;
}

export interface AppSeries {
  spec: RangeSpec;
  /** GA4 확정 테이블이 어디까지 있나(YYYYMMDD). 못 읽었으면 null */
  through: string | null;
  /** 만든 시각 — KST "YYYY-MM-DD HH:mm" */
  generatedAt: string;
  buckets: SeriesBucket[];
  groups: SeriesGroup[];
  caveats: string[];
  /** 읽기 실패 — 사람이 읽을 문장. 위 띠에 개수, 머리말 아래에 문장 */
  warnings: string[];
}

// ── 칸 하나 ─────────────────────────────────────────────────────────
const MISSING: Cell = { v: null, why: "못 읽음" };
const PENDING: Cell = { v: null, why: "집계 전" };
const NO_DAY: Cell = { v: null, why: "일 단위 없음" };
const num = (v: number | null | undefined): Cell => (typeof v === "number" && Number.isFinite(v) ? { v } : { v: null, why: "못 셈" });
/** 비율 — 분모가 0 이면 값이 아니라 「표본 없음」, 30 미만이면 흐리게 */
const rate = (v: number | null | undefined, n: number): Cell => {
  if (n <= 0) return { v: null, why: "표본 없음", n: 0 };
  if (typeof v !== "number") return { v: null, why: "못 셈", n };
  return n < SMALL_SAMPLE ? { v, n, weak: true, why: `표본 ${n}` } : { v, n };
};
const gap = (c?: "full" | "partial" | "none"): Cell => ({ v: null, why: c === "partial" ? "이벤트 중간 배포" : "이벤트 없던 기간" });

interface Ctx {
  unit: RangeUnit;
  /** 「기간 전체」 열을 만드는 중인가 */
  total: boolean;
  /** 이 칸의 창 — YYYYMMDD */
  start: string;
  end: string;
}

type Pick = (c: CellInput, ctx: Ctx) => Cell;

/** GA4 칸 — 집계 전·못 읽음을 먼저 가른다 */
const fromGa4 = (f: (g: Ga4AppMetrics, ctx: Ctx) => Cell): Pick => (c, ctx) => (c.ga4Pending ? PENDING : c.ga4 ? f(c.ga4, ctx) : MISSING);
/** 쿠폰 퍼널 칸 — readCouponFunnel */
const fromCoupons = (f: (x: CouponFunnel) => Cell): Pick => (c) => (c.ga4Pending ? PENDING : c.coupons ? f(c.coupons) : MISSING);
const fromUse = (f: (x: CouponUseFunnel) => Cell): Pick => (c) => (c.ga4Pending ? PENDING : c.use ? f(c.use) : MISSING);
/** DB 칸 — 못 센 칸은 백엔드가 failed 에 이름을 적는다 */
const fromDb = (k: string): Pick => (c) => {
  if (!c.db?.stats) return MISSING;
  if ((c.db.failed ?? []).includes(k)) return { v: null, why: "못 셈" };
  return num(c.db.stats[k]);
};
/**
 * 이벤트가 나중에 생긴 칸 — 창이 그 전에 걸치면 0 이 아니라 「없던 것」이다(EVENT_LIVE_FROM).
 * 매장 상세(restaurant_detail_open)는 5/5 에 생겨서, 3~4월 칸이 「매장 상세 0 · 0%」로 찍혔다(1015).
 */
const needs = (event: string, p: Pick): Pick => (c, ctx) => {
  const cov = eventCoverage(event, ctx.start, ctx.end);
  return cov === "full" || c.ga4Pending ? p(c, ctx) : gap(cov);
};
/** 일 단위에서 뜻이 없는 칸 — 관찰 창(코호트 7~13일째 · 14일 · 클릭 뒤 7일)이 하루보다 길다. 기간 전체 열은 센다 */
const notDaily = (p: Pick): Pick => (c, ctx) => (ctx.unit === "day" && !ctx.total ? NO_DAY : p(c, ctx));

interface Def {
  key: string;
  label: string | ((u: RangeUnit) => string);
  unit: string;
  source: SeriesSource;
  kind: SeriesKind;
  note: string | ((u: RangeUnit) => string);
  sub?: boolean;
  pick: Pick;
}

const UNIT_ACTIVE: Record<RangeUnit, string> = { day: "그날", week: "그 주", month: "그 달" };

const GROUPS: { key: string; title: string; defs: Def[] }[] = [
  {
    key: "usage",
    title: "앱 이용",
    defs: [
      {
        key: "active", label: "활성 기기", unit: "명", source: "ga4", kind: "count",
        note: (u) => `${UNIT_ACTIVE[u]} 앱을 켠 기기 수(user_engagement). 주 단위면 WAU, 월 단위면 그 달 활성. 재설치하면 새로 셉니다`,
        pick: fromGa4((g) => num(g.wau)),
      },
      {
        key: "new_devices", label: "처음 온 기기", unit: "명", source: "ga4", kind: "count", sub: true,
        note: "활성 기기 중 같은 칸 안에 처음 앱을 연(first_open) 기기",
        pick: fromGa4((g) => num(g.new_devices)),
      },
      {
        key: "returning", label: "다시 온 기기", unit: "명", source: "ga4", kind: "count", sub: true,
        note: "활성 기기 − 처음 온 기기. 활성이 뛴 칸이 「새로 온 것」인지 「돌아온 것」인지 가릅니다",
        pick: fromGa4((g) => (g.wau !== null && g.new_devices !== null && g.wau >= g.new_devices ? { v: g.wau - g.new_devices } : { v: null, why: "못 셈" })),
      },
      {
        key: "dau", label: "하루 평균 활성(DAU)", unit: "명", source: "ga4", kind: "avg",
        note: "칸 안의 하루 활성 기기 평균 — 사용자가 없던 날도 하루로 셉니다",
        pick: fromGa4((g) => num(g.dau)),
      },
      {
        key: "stickiness", label: (u) => (u === "month" ? "DAU/MAU" : "DAU/WAU"), unit: "%", source: "ga4", kind: "rate",
        note: "하루 평균 활성 ÷ 칸 전체 활성. 끈적함 — 주 단위 20% 를 넘으면 습관이 붙은 것",
        pick: notDaily(fromGa4((g) => (g.wau ? rate(g.dau_wau, g.wau) : { v: null, why: "표본 없음" }))),
      },
      {
        key: "mau", label: "30일 활성", unit: "명", source: "ga4", kind: "count",
        note: "칸의 끝 날에서 거꾸로 30일간 앱을 켠 기기 수",
        pick: fromGa4((g) => num(g.mau)),
      },
      {
        key: "retention_w1", label: "가입 1주 후 복귀", unit: "%", source: "firebase", kind: "rate",
        note: (u) => u === "month"
          ? "그 달 첫 실행(말일 13일 전까지) 기기 중 7~13일째 다시 켠 비율"
          : "끝 날에서 14~20일 전 첫 실행 기기 중 7~13일째 다시 켠 비율 — 주간 보고서와 같은 고정 창",
        pick: notDaily(fromGa4((g) => rate(g.retention_w1, g.cohort.users))),
      },
      {
        key: "signups", label: "가입", unit: "명", source: "backend", kind: "count",
        note: "새로 만든 계정(직원 제외). 지금 다시 센 값이라 그 뒤 탈퇴한 계정은 빠집니다",
        pick: fromDb("signups"),
      },
    ],
  },
  {
    key: "funnel",
    title: "찾기 퍼널",
    defs: [
      {
        key: "sessions", label: "앱 열기 세션", unit: "세션", source: "ga4", kind: "count",
        note: "SDK 세션(ga_session_id) 중 session_start 가 있는 세션",
        pick: fromGa4((g) => num(g.sessions)),
      },
      {
        key: "detail_sessions", label: "매장 상세를 연 세션", unit: "세션", source: "ga4", kind: "count", sub: true,
        note: "같은 세션 안에 restaurant_detail_open 이 있는 세션",
        pick: needs("restaurant_detail_open", fromGa4((g) => num(detailSessions(g)))),
      },
      {
        key: "coupon_sessions", label: "그 자리에서 쿠폰 받은 세션", unit: "세션", source: "ga4", kind: "count", sub: true,
        note: "그 매장 상세를 연 세션에서 같은 매장 쿠폰을 받은 세션. 캠페인 자동 지급은 뺍니다",
        pick: needs("restaurant_detail_open", fromGa4((g) => num(g.sessions_detail_to_coupon))),
      },
      {
        key: "open_to_store", label: "앱 열기 → 매장 상세", unit: "%", source: "ga4", kind: "rate",
        note: "앱 열기 세션 중 매장 상세를 연 비율",
        pick: needs("restaurant_detail_open", fromGa4((g) => rate(g.open_to_store, g.sessions))),
      },
      {
        key: "list_ctr", label: "매장 목록 카드 → 클릭", unit: "%", source: "ga4", kind: "rate",
        note: "매장 목록에서 카드가 보인(절반 이상 · 1초) 세션·매장 중 같은 세션에 그 카드를 누른 비율. 노출은 앱 2.6.0 부터라 그 기기만 셉니다",
        pick: needs("restaurant_list_impression", fromGa4((g) => {
          if (!g.list_view) return { v: null, why: "못 셈" };
          return g.list_view.seen === 0 ? { v: null, why: "노출 이벤트 없음", n: 0 } : rate(g.list_ctr, g.list_view.seen);
        })),
      },
      {
        key: "store_to_coupon", label: "매장 상세 → 쿠폰 발급", unit: "%", source: "ga4", kind: "rate",
        note: "매장 상세를 연 (기기·세션·매장) 중 그 자리에서 캠페인이 아닌 쿠폰을 받은 비율",
        pick: needs("restaurant_detail_open", (c) => (c.ga4Pending ? PENDING : c.s2c ? rate(c.s2c.rate, c.s2c.views) : MISSING)),
      },
    ],
  },
  {
    key: "coupon",
    title: "쿠폰",
    defs: [
      { key: "coupon_issued", label: "쿠폰 발급", unit: "건", source: "backend", kind: "count", note: "발급된 쿠폰(취소 제외). 쿠폰함을 열 때 만료 쿠폰이 지워져 지난 칸은 다시 세면 줄 수 있습니다", pick: fromDb("coupon_issued") },
      { key: "coupon_used", label: "쿠폰 사용", unit: "건", source: "backend", kind: "count", note: "매장에서 사용 처리된 날 기준 — 그 전에 받은 쿠폰도 셉니다", pick: fromDb("coupon_redeemed") },
      {
        key: "coupon_rate_db", label: "발급 → 사용(DB)", unit: "%", source: "backend", kind: "rate",
        note: "그 칸에 발급된 쿠폰 중 지금까지 쓴 비율. 최근 칸은 쓸 시간이 짧아 낮게 나옵니다",
        pick: fromDb("coupon_redeem_rate"),
      },
      {
        key: "coupon_rate_organic", label: "쿠폰 사용률 (캠페인 외)", unit: "%", source: "ga4", kind: "rate",
        note: "가입 환영·스탬프 보상·추천·한정 등 그 칸에 받은 쿠폰 중 같은 칸 안에 쓰인 비율(coupon_code 로 잇습니다)",
        pick: fromCoupons((f) => (f.organic.issued === 0 ? { v: null, why: "발급 없음", n: 0 } : rate(f.organic.rate, f.organic.issued))),
      },
      {
        key: "coupon_rate_campaign", label: "쿠폰 사용률 (캠페인)", unit: "%", source: "ga4", kind: "rate",
        note: "기획전으로 뿌린 쿠폰 중 같은 칸 안에 쓰인 비율",
        pick: fromCoupons((f) => (f.campaign.issued === 0 ? { v: null, why: "발급 없음", n: 0 } : rate(f.campaign.rate, f.campaign.issued))),
      },
      {
        key: "coupon_claimed", label: "쿠폰 받기", unit: "장", source: "ga4", kind: "count",
        note: "학생이 「받기」를 눌러 받은 쿠폰 — 한정쿠폰 · 추천코드 · 환영 미션 · 스탬프 보상. 자동 지급은 빠집니다. 앱 2.6.0(10/12~)부터라 보급 중에는 구버전 기기 몫이 빠집니다",
        pick: needs("coupon_claim", fromCoupons((f) => (f.claim ? { v: f.claim.claimed } : { v: null, why: "못 셈" }))),
      },
      {
        key: "claim_to_use", label: "받은 쿠폰 → 사용", unit: "%", source: "ga4", kind: "rate",
        note: "그 칸에 「받기」로 받은 쿠폰 중 같은 칸 안에 쓰인 비율(coupon_code 로 잇습니다). 한정쿠폰도 학생이 고른 것이라 캠페인/그 외를 가르지 않습니다",
        pick: needs("coupon_claim", fromCoupons((f) => {
          if (!f.claim) return { v: null, why: "못 셈" };
          return f.claim.claimed === 0 ? { v: null, why: "받기 없음", n: 0 } : rate(f.claim.rate, f.claim.claimed);
        })),
      },
      {
        key: "wallet_to_use", label: "쿠폰함 → 사용 화면", unit: "%", source: "ga4", kind: "rate",
        note: "쿠폰함을 본 기기 중 사용 화면까지 간 비율 (이벤트 8/31~)",
        pick: fromCoupons((f) => (f.coverage.wallet_to_use === "full" ? rate(f.wallet.rate, f.wallet.saw) : gap(f.coverage.wallet_to_use))),
      },
      {
        key: "redeem_success", label: "사용 시도 성공률", unit: "%", source: "ga4", kind: "rate",
        note: "사용 결과(성공+실패) 중 성공 (실패 이벤트 9/7~)",
        pick: fromCoupons((f) => (f.coverage.redeem_outcome === "full" ? rate(f.attempt.rate, f.attempt.ok + f.attempt.failed) : gap(f.coverage.redeem_outcome))),
      },
    ],
  },
  {
    key: "use",
    title: `쓰기 퍼널 — 그 칸에 받은 쿠폰을 ${FOLLOW_DAYS}일 따라감`,
    defs: (["organic", "campaign"] as const).flatMap((line): Def[] => {
      const name = line === "organic" ? "캠페인 외" : "캠페인";
      const steps = (f: CouponUseFunnel) => f.coverage.steps === "full";
      return [
        {
          key: `use_${line}_issued`, label: `${name} · 받은 쿠폰`, unit: "장", source: "ga4", kind: "count",
          note: `그 칸에 처음 받은 ${name} 쿠폰 — 재설치·다른 기기에서 다시 보인 쿠폰은 처음 받은 날로 셉니다`,
          pick: fromUse((f) => ({ v: f[line].issued })),
        },
        {
          key: `use_${line}_screen`, label: "사용 화면", unit: "장", source: "ga4", kind: "count", sub: true,
          note: `받은 뒤 ${FOLLOW_DAYS}일 안에 사용 화면을 연 쿠폰(뒤 단계에 간 쿠폰 포함)`,
          pick: fromUse((f) => (steps(f) ? { v: f[line].screen } : gap(f.coverage.steps))),
        },
        {
          key: `use_${line}_attempt`, label: "사용 시도", unit: "장", source: "ga4", kind: "count", sub: true,
          note: "사용을 시도한 쿠폰(쓰인 쿠폰 포함)",
          pick: fromUse((f) => (steps(f) ? { v: f[line].attempt } : gap(f.coverage.steps))),
        },
        {
          key: `use_${line}_redeemed`, label: `${FOLLOW_DAYS}일 안에 사용`, unit: "장", source: "ga4", kind: "count", sub: true,
          note: `받은 뒤 ${FOLLOW_DAYS}일 안에 쓰인 쿠폰. 아직 ${FOLLOW_DAYS}일이 안 지난 쿠폰이 섞인 칸은 흐리게 그립니다`,
          pick: fromUse((f) => (f.maturing > 0 ? { v: f[line].redeemed, weak: true, why: `지켜보는 중 ${f.maturing}장` } : { v: f[line].redeemed })),
        },
      ];
    }),
  },
  {
    key: "loyalty",
    title: "스탬프 · 마일리지",
    defs: [
      { key: "stamp_earned", label: "스탬프 적립", unit: "건", source: "backend", kind: "count", note: "스탬프를 찍은 횟수 — 한 번에 여러 개를 찍어도 1건", pick: fromDb("stamp_earned") },
      { key: "stamp_reward", label: "스탬프 보상 수령", unit: "건", source: "backend", kind: "count", note: "스탬프를 채워 발급된 보상 쿠폰", pick: fromDb("stamp_reward") },
      { key: "mileage_entries", label: "마일리지 응모", unit: "건", source: "backend", kind: "count", note: "래플 응모", pick: fromDb("mileage_entries") },
      { key: "mileage_winners", label: "마일리지 당첨", unit: "건", source: "backend", kind: "count", note: "래플 당첨", pick: fromDb("mileage_winners") },
      { key: "mileage_exchanges", label: "마일리지로 쿠폰 교환", unit: "건", source: "backend", kind: "count", note: "마일리지를 써서 쿠폰으로 바꾼 횟수", pick: fromDb("mileage_exchanges") },
    ],
  },
  {
    key: "push",
    title: "푸시 · 배너",
    defs: [
      { key: "push_sent", label: "푸시 발송", unit: "건", source: "push", kind: "count", note: "전체 알림 + 매장 예약 알림. 개발자 테스트 발송은 뺍니다", pick: fromDb("push_sent") },
      {
        key: "push_open", label: "푸시 → 앱 열기", unit: "%", source: "firebase", kind: "rate",
        note: (u) => `안드로이드 수신 중 열린 비율(iOS 는 수신을 못 셉니다). ${u === "month" ? "그 달 안에서" : "주 단위는 끝 날에서 거꾸로 14일"}`,
        pick: notDaily(fromGa4((g) => rate(g.push_open, g.push.received))),
      },
      {
        key: "banner_ctr", label: "배너 노출 → 클릭", unit: "%", source: "ga4", kind: "rate",
        note: "노출 이벤트(home_banner_impression, 앱 2.5.8~)를 보낸 기기 중 배너도 누른 기기",
        pick: fromGa4((g) => ((g.banner_view?.seen ?? 0) === 0 ? { v: null, why: "노출 이벤트 없음", n: 0 } : rate(g.banner_ctr, g.banner_view!.seen))),
      },
      {
        key: "banner_to_coupon", label: "배너 클릭 → 쿠폰 사용", unit: "%", source: "ga4", kind: "rate",
        note: (u) => `배너를 누른 기기 중 7일 안에 쿠폰을 쓴 비율. ${u === "month" ? "그 달 안에서(클릭은 말일 7일 전까지)" : "주 단위는 끝 날 7일 전까지 4주치 클릭 — 주간 보고서와 같은 고정 창"}`,
        pick: notDaily(fromGa4((g) => rate(g.banner_to_coupon, g.banner.clicked))),
      },
    ],
  },
];

/** 주요 지표 보고서가 행을 키로 찾는다 */
export const SERIES_KEYS = GROUPS.flatMap((g) => g.defs.map((d) => d.key));

/** DB 건수의 「기간 전체」 — 칸이 기간을 겹침 없이 나누므로(반열린 구간) 합이 곧 기간 값이다 */
function sumCells(cells: Cell[]): Cell {
  if (cells.some((c) => c.v === null)) return { v: null, why: "일부 칸 못 읽음" };
  return { v: cells.reduce((a, c) => a + (c.v as number), 0) };
}

export interface SeriesInput {
  spec: RangeSpec;
  through: string | null;
  /** KST 오늘 — YYYYMMDD */
  today: string;
  /** KST "YYYY-MM-DD HH:mm" — 안 주면 지금 */
  generatedAt?: string;
  cells: CellInput[];
  /** 「기간 전체」를 한 번에 센 것. db 는 비율만 쓴다(92일 넘는 기간은 백엔드가 못 세 null) */
  total: CellInput;
  warnings?: string[];
}

export function buildSeries({ spec, through, today, generatedAt, cells, total, warnings = [] }: SeriesInput): AppSeries {
  if (cells.length !== spec.buckets.length) throw new Error(`칸 수가 맞지 않습니다 — 기간 ${spec.buckets.length}칸, 읽은 값 ${cells.length}칸`);
  const unit = spec.unit;
  const buckets: SeriesBucket[] = spec.buckets.map((b) => ({ ...b, open: through ? b.end > through : b.end >= today }));

  const groups: SeriesGroup[] = GROUPS.map((g) => ({
    key: g.key,
    title: g.title,
    rows: g.defs.map((d): SeriesRow => {
      const row = cells.map((c, i) => d.pick(c, { unit, total: false, start: spec.buckets[i].start, end: spec.buckets[i].end }));
      const dbCount = (d.source === "backend" || d.source === "push") && d.kind === "count";
      return {
        key: d.key,
        label: typeof d.label === "function" ? d.label(unit) : d.label,
        unit: d.unit,
        source: d.source,
        kind: d.kind,
        note: typeof d.note === "function" ? d.note(unit) : d.note,
        ...(d.sub ? { sub: true } : {}),
        cells: row,
        total: dbCount ? sumCells(row) : d.pick(total, { unit, total: true, start: spec.start, end: spec.end }),
      };
    }),
  }));

  const anyOpen = buckets.some((b) => b.open);
  const caveats = [
    "**주 단위 칸은 주간 보고서, 월 단위 칸은 월간 보고서와 같은 정의로 셉니다(GA4).** DB 칸은 지금 다시 센 값이라, 월별 스냅샷(굳힌 값)을 쓰는 월간 보고서와 그 사이 탈퇴·만료 쿠폰 삭제만큼 다를 수 있습니다.",
    "**기기 단위입니다.** 출시된 앱이 setUserId 를 안 불러 사람이 아니라 기기를 셉니다. 재설치하면 새 기기로 셉니다.",
    "**「기간 전체」 열의 활성·비율은 칸을 더한 값이 아니라 기간을 한 번에 다시 센 값입니다.** DB 건수만 칸의 합입니다.",
    unit === "day"
      ? "**일 단위에서는 DAU/WAU · 복귀 · 푸시 → 열기 · 배너 클릭 → 쿠폰을 세지 않습니다** — 관찰 창이 하루보다 깁니다. 「기간 전체」 열에는 있습니다."
      : unit === "week"
        ? "**주 단위의 복귀 · 푸시 → 열기 · 배너 클릭 → 쿠폰은 끝 날에서 거꾸로 잡은 고정 창입니다**(첫 실행 14~20일 전 · 14일 · 클릭 4주). 주간 보고서와 같습니다."
        : "**월 단위의 복귀 · 푸시 → 열기 · 배너 클릭 → 쿠폰은 그 달 안에서 잡습니다** — 월간 보고서와 같습니다.",
    `**쓰기 퍼널은 그 칸에 처음 받은 쿠폰을 ${FOLLOW_DAYS}일 따라갑니다.** 끝 쪽 칸은 ${FOLLOW_DAYS}일이 안 지난 쿠폰이 섞여 낮게 나올 수 있습니다(흐린 숫자).`,
    "**빈 칸(–)은 0 이 아닙니다.** 칸에 마우스를 올리면 이유가 나옵니다 — 못 읽음 · 이벤트 없던 기간 · 발급 없음 · 일 단위 없음 · 집계 전.",
    "**흐린 숫자**는 표본 30 미만이거나 아직 지켜보는 중인 값입니다. 판정 근거로 쓰기엔 모자랍니다.",
  ];
  if (anyOpen) {
    caveats.splice(1, 0, `**＊ 표시 칸은 아직 끝나지 않았습니다** — GA4 는 ${through ? dashed(through) : "확정 테이블"}까지, DB 는 지금까지 센 값입니다.`);
  }

  return {
    spec,
    through,
    generatedAt: generatedAt ?? new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 16).replace("T", " "),
    buckets,
    groups,
    caveats,
    warnings,
  };
}

/** 키로 행 하나 — 주요 지표 보고서 */
export function seriesRow(s: AppSeries, key: string): SeriesRow | null {
  for (const g of s.groups) for (const r of g.rows) if (r.key === key) return r;
  return null;
}
