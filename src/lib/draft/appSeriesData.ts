import type { Ga4AppMetrics } from "@/lib/bigquery/appMetrics";
import { eventCoverage, EVENT_LIVE_FROM, FOLLOW_DAYS, V260_RELEASED, V260_SETTLE_DAYS, V260_SHARE_MIN, type CouponFunnel, type CouponUseFunnel } from "@/lib/bigquery/couponFunnel";
import { ACCOUNT_EXCLUSION, EXCLUSIONS, type AppEvent } from "./appEvents";
import { detailSessions, SMALL_SAMPLE, type AffiliateStores, type PeriodStats } from "./appReportData";
import { dashed, shiftDays, type Bucket, type RangeSpec, type RangeUnit } from "./appRange";

/**
 * Probe · 앱 지표 **기간 × 단위** 표의 데이터 변환 — 칸마다 읽어 온 값을 지표 행으로 바꾼다(민찬 1015).
 * 「지표 보고서 원본」(표 · CSV)과 「주요 지표 보고서」(그래프)가 같은 행을 읽는다.
 *
 * 여기는 **순수 함수만** 둔다(가져오기는 appSeries.ts) — 그래야 테스트가 돈다.
 *
 * 규칙은 주간 보고서(appReportData)와 같다.
 *  - 없는 칸은 0 으로 채우지 않는다. 왜 없는지(`why`)를 짧게 적는다 — 못 읽음 · 계측 전 · 발급 없음 · 일 단위 없음.
 *  - 비율에는 분모(`n`)와 분자(`x`)를 붙이고, 표본이 30 미만이면 흐리게 그린다(`weak`).
 *  - 이벤트가 나중에 생긴 칸은 창이 그 전에 걸치면 값을 내지 않는다(coverage) — 8월 「쿠폰함 → 사용 화면」 4.3% 사고.
 *
 * 1022 기획팀 검토(민찬 채택)로 바뀐 것 — 같은 이름에 다른 값이 없게 하는 것이 목표다.
 *  - 쿠폰 사용률은 「처음 받은 쿠폰의 7일 사용률」 하나만 둔다(같은 칸 안 사용률 3종 삭제, S37 · M1).
 *  - 쿠폰 발급은 월 칸이면 월말 스냅샷, 일·주 칸이면 GA4 「처음 받은 쿠폰」(S4 · D10). DB 를 다시 세면 만료 삭제만큼 준다.
 *  - 복귀는 「첫 실행 기기 1주 후 복귀」, 출처 GA4(BigQuery), 칸마다 코호트 날짜·n(S33 · R10). 주 칸은 4주 코호트.
 *  - 기기 지표는 「대」, 계정 지표는 「명」(R18). 행마다 집계방식 · 세는 단위를 단다(S1).
 *  - 마일리지 응모 · 당첨은 회차 요약(별도 표)으로, 마일리지로 쿠폰 교환은 삭제(S40 · S41).
 */

export type SeriesSource = "ga4" | "backend" | "snapshot";
/** count = 건수 · avg = 평균 · rate = 비율(%) */
export type SeriesKind = "count" | "avg" | "rate";

export interface Cell {
  v: number | null;
  /** 값이 없는 이유, 또는 값에 붙는 주의 — 짧게 */
  why?: string;
  /** 비율의 분모 */
  n?: number;
  /** 비율의 분자 — 칸을 묶거나 두 비율을 견줄 때(z검정) 다시 센다 */
  x?: number;
  /** 표본이 얕거나 아직 지켜보는 중 — 흐리게 그린다 */
  weak?: boolean;
  /** 지표가 생기기 전 칸 — 값은 없지만 합계에서는 0 으로 친다(QR 안내 전 등) */
  pre?: boolean;
  /** 칸과 다른 창으로 센 지표의 실제 창 — 「9/1~9/14 첫 실행 132대」 */
  span?: string;
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
  /** 집계방식 — 합 · 칸 안 고유 · 하루 평균 · 비율(원본 CSV 의 열, S1) */
  agg: string;
  /** 세는 단위 — 기기 · 계정 · 쿠폰 · 세션 · 매장 · P */
  counts: string;
  cells: Cell[];
  total: Cell;
}

export interface SeriesGroup {
  key: string;
  title: string;
  rows: SeriesRow[];
}

/** 월말 스냅샷 한 달(`metric-snapshots`) */
export interface SnapshotRow {
  stats: Record<string, number | null>;
  counted_at: string;
  complete: boolean;
}

/** 칸 하나에서 읽어 온 것. 못 읽었으면 null — 0 이 아니다 */
export interface CellInput {
  ga4: Ga4AppMetrics | null;
  coupons: CouponFunnel | null;
  use: CouponUseFunnel | null;
  /** app-stats/period. 「기간 전체」 열에서는 칸을 더할 수 없는 값(고유 계정 · 매장)만 쓴다 — 건수는 칸의 합이다 */
  db: PeriodStats | null;
  /** 월 칸의 월말 스냅샷 — 없는 달은 null(스냅샷을 걸기 전) */
  snap?: SnapshotRow | null;
  /** 월 칸의 매장별 스냅샷 {restaurant_id: {칸: 값}} — 원본 보조표의 매장 × 월(S8) */
  stores?: Record<string, Record<string, number | null>> | null;
  /** 그 칸이 GA4 확정 테이블보다 뒤에서 시작한다 — 읽지 않았다(「집계 전」) */
  ga4Pending?: boolean;
}

export interface SeriesBucket extends Bucket {
  /** 아직 안 끝난 칸 — GA4 는 확정 테이블까지, DB 는 지금까지 센 값이다 */
  open: boolean;
}

/** 평시 기준선의 창 하나 — KPI 에 쓰는 행만 센다 */
export interface BaseWindow {
  start: string;
  end: string;
  cells: Record<string, Cell>;
}

/** 마일리지 추첨 회차 한 줄(백엔드 app-stats/raffles) */
export interface RaffleRound {
  id: number;
  title: string;
  prize_label: string;
  status: string;
  closes_at: string;
  drawn_at: string | null;
  entries: number;
  entrants: number;
  points: number;
  winners: number;
  voucher_redeemed: number;
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
  /** 사건 — Astro 캠페인 주간 + 고정 사건(appEvents). */
  events: AppEvent[];
  /** 캠페인 주간 표를 읽었나. 못 읽었으면 KPI 판정을 모두 미룬다 — 캠페인 칸을 평시로 착각하지 않게 */
  eventsOk: boolean;
  /** 평시 기준선 창 — 고정 두 주(9/1~14)와 그 뒤 사건 없는 주. KPI 판정과 기준선 점선이 쓴다 */
  baseline: { fixed: BaseWindow[]; weeks: BaseWindow[] };
  /** DB 기준 시각 — 백엔드가 센 시각 중 가장 늦은 것(KST "YYYY-MM-DD HH:mm"). 못 읽었으면 null */
  dbAt: string | null;
  /** 생성기 리비전 — 배포 커밋 7자리. 로컬이면 local */
  revision: string;
  /** 실제로 덜어 낸 값 — 「9/7 쿠폰 사용 −2 · 팀 테스트」 */
  exclusions: string[];
  /** 마일리지 회차(마감이 기간 안인 것). null 이면 못 읽음(백엔드 반영 전 포함) */
  rounds: RaffleRound[] | null;
  /** 원본 보조표(long) — 차원이 있는 값. 원본 CSV 에 행으로 늘리면 칸마다 BigQuery 호출이 곱해져 따로 낸다(X8) */
  long: LongRow[];
}

/** 보조표 한 줄 — 「쿠폰 사용 실패 사유 · 9/1~9/7 · http_403 · 건 · 12」 */
export interface LongRow {
  table: string;
  /** 칸 — YYYYMMDD 둘 */
  start: string;
  end: string;
  dim: string;
  metric: string;
  v: number | null;
}

/** 칸마다 읽어 둔 차원 값을 보조표로 — 쿠폰·스탬프 실패 사유(S7) · 쿠폰 종류별(S9) · 매장 × 월(S8) */
function longRows(spec: RangeSpec, cells: CellInput[]): LongRow[] {
  const out: LongRow[] = [];
  cells.forEach((c, i) => {
    const { start, end } = spec.buckets[i];
    const add = (table: string, dim: string, metric: string, v: number | null) => out.push({ table, start, end, dim, metric, v });
    for (const r of c.coupons?.attempt.reasons ?? []) add("쿠폰 사용 실패 사유(GA4)", r.reason, "건", r.n);
    for (const r of c.coupons?.stampFail ?? []) add("스탬프 적립 실패 사유(GA4)", r.reason, "건", r.n);
    for (const r of c.coupons?.bySource ?? []) {
      add("쿠폰 종류별(GA4 발급 경로, 같은 칸)", `${r.source}${r.campaign ? " · 캠페인" : ""}`, "발급", r.issued);
      add("쿠폰 종류별(GA4 발급 경로, 같은 칸)", `${r.source}${r.campaign ? " · 캠페인" : ""}`, "그중 사용", r.redeemed);
    }
    for (const r of c.db?.affiliate_stores?.inactive ?? []) add(IDLE_STORES_TABLE, r.name, "활동", 0);
    for (const [rid, m] of Object.entries(c.stores ?? {})) {
      for (const [k, label] of [["coupon_redeemed", "쿠폰 사용"], ["stamp_earned", "스탬프 적립"], ["active_users", "이용 계정"], ["coupon_users", "쿠폰 쓴 계정"], ["voucher_redeemed", "식사권 사용"]] as const) {
        add("매장 × 월(월말 스냅샷)", `매장 ${rid}`, label, m[k] ?? null);
      }
    }
  });
  return out;
}

// ── 칸 하나 ─────────────────────────────────────────────────────────
const MISSING: Cell = { v: null, why: "못 읽음" };
const PENDING: Cell = { v: null, why: "집계 전" };
const NO_DAY: Cell = { v: null, why: "일 단위 없음" };
const md = (d: string) => `${+d.slice(4, 6)}/${+d.slice(6, 8)}`;
const mdIso = (iso: string) => md(iso.replace(/-/g, ""));
const num = (v: number | null | undefined): Cell => (typeof v === "number" && Number.isFinite(v) ? { v } : { v: null, why: "못 셈" });
/** 비율 — 분자 ÷ 분모. 분모가 0 이면 값이 아니라 「표본 없음」, 30 미만이면 흐리게 */
const rate = (x: number | null | undefined, n: number | null | undefined): Cell => {
  if (typeof n !== "number" || n <= 0) return { v: null, why: "표본 없음", n: 0 };
  if (typeof x !== "number") return { v: null, why: "못 셈", n };
  const v = Math.round((x / n) * 1000) / 10;
  return n < SMALL_SAMPLE ? { v, n, x, weak: true, why: `표본 ${n}` } : { v, n, x };
};
/** 이벤트가 생기기 전(none) · 중간에 생긴(partial) 칸 — 「계측 전」(1022 기획팀 검토 S34) */
const gap = (event: string, c: "full" | "partial" | "none"): Cell => {
  const from = EVENT_LIVE_FROM[event];
  return c === "partial"
    ? { v: null, why: `이벤트 중간 배포(${from ? md(from) : "?"}~)` }
    : { v: null, why: `계측 전(${from ? md(from) : "?"}~)`, pre: true };
};

interface Ctx {
  unit: RangeUnit;
  /** 「기간 전체」 열을 만드는 중인가 */
  total: boolean;
  /** 이 칸의 창 — YYYYMMDD */
  start: string;
  end: string;
  /** GA4 확정 테이블 끝 — 7일 추적이 다 찼는지 */
  through: string | null;
}

type Pick = (c: CellInput, ctx: Ctx) => Cell;

/** GA4 칸 — 집계 전·못 읽음을 먼저 가른다 */
const fromGa4 = (f: (g: Ga4AppMetrics, ctx: Ctx) => Cell): Pick => (c, ctx) => (c.ga4Pending ? PENDING : c.ga4 ? f(c.ga4, ctx) : MISSING);
/** 쿠폰 퍼널 칸 — readCouponFunnel */
const fromCoupons = (f: (x: CouponFunnel, ctx: Ctx) => Cell): Pick => (c, ctx) => (c.ga4Pending ? PENDING : c.coupons ? f(c.coupons, ctx) : MISSING);
const fromUse = (f: (x: CouponUseFunnel) => Cell): Pick => (c) => (c.ga4Pending ? PENDING : c.use ? f(c.use) : MISSING);
/** DB 칸 — 못 센 칸은 백엔드가 failed 에 이름을 적는다. 키가 아예 없으면 그 칸을 세는 백엔드가 아직 안 나갔다 */
const fromDb = (k: string): Pick => (c) => {
  if (!c.db?.stats) return MISSING;
  if ((c.db.failed ?? []).includes(k)) return { v: null, why: "못 셈" };
  if (!(k in c.db.stats)) return { v: null, why: "백엔드 미반영" };
  return num(c.db.stats[k]);
};
/** 앱 제휴 매장 칸 — 백엔드가 못 읽었으면 null, 키가 아예 없으면 그 칸을 세는 백엔드가 아직 안 나갔다(D8 · 1023) */
const fromAffiliates = (f: (a: AffiliateStores) => Cell): Pick => (c) => {
  if (!c.db?.stats) return MISSING;
  if (!("affiliate_stores" in c.db)) return { v: null, why: "백엔드 미반영" };
  return c.db.affiliate_stores ? f(c.db.affiliate_stores) : { v: null, why: "못 셈" };
};
/** 활동 0건 제휴 매장 보조표 — 주요 지표 보고서가 KPI 칸의 목록을 여기서 읽는다 */
export const IDLE_STORES_TABLE = "활동 0건 제휴 매장";
/** 월 칸은 월말 스냅샷(굳힌 값), 없으면 지금 다시 센 값에 그렇다고 적는다(D10 · 민찬 1022 「월말 스냅샷」) */
const fromSnapOr = (k: string, live: Pick): Pick => (c, ctx) => {
  const v = c.snap?.stats?.[k];
  if (typeof v === "number") return { v };
  const l = live(c, ctx);
  return l.v === null ? l : { ...l, why: "스냅샷 없음 · 지금 다시 센 값" };
};
/**
 * 이벤트가 나중에 생긴 칸 — 창이 그 전에 걸치면 0 이 아니라 「없던 것」이다(EVENT_LIVE_FROM).
 * 매장 상세(restaurant_detail_open)는 5/5 에 생겨서, 3~4월 칸이 「매장 상세 0 · 0%」로 찍혔다(1015).
 */
const needs = (event: string, p: Pick): Pick => (c, ctx) => {
  const cov = eventCoverage(event, ctx.start, ctx.end);
  return cov === "full" || c.ga4Pending ? p(c, ctx) : gap(event, cov);
};
/** 일 단위에서 뜻이 없는 칸 — 관찰 창(코호트 7~13일째 · 클릭 뒤 7일)이 하루보다 길다. 기간 전체 열은 센다 */
const notDaily = (p: Pick): Pick => (c, ctx) => (ctx.unit === "day" && !ctx.total ? NO_DAY : p(c, ctx));

/** 칸 안 기기 중 2.6.0 이상 비율(%) — 못 셌으면 null */
const v260Share = (g: Ga4AppMetrics | null): number | null =>
  g?.app_v260 && g.app_v260.active > 0 ? Math.round((g.app_v260.devices / g.app_v260.active) * 1000) / 10 : null;
/** 게시 2주가 지났고 보급이 50% 를 넘었나(민찬 1022 D6 「둘 다 충족」) */
export function v260Ready(end: string, share: number | null): boolean {
  return end >= shiftDays(V260_RELEASED, V260_SETTLE_DAYS) && share !== null && share >= V260_SHARE_MIN;
}
/**
 * 2.6.0 이벤트 칸 — 기준을 넘기 전에는 흐리게 그리고 판정에 쓰지 않는다.
 * 구버전 기기의 몫이 빠진 값이라 보급이 덜 된 칸은 실제보다 작게 나온다.
 */
const after260 = (p: Pick): Pick => (c, ctx) => {
  const cell = p(c, ctx);
  if (cell.v === null) return cell;
  const share = v260Share(c.ga4);
  if (v260Ready(ctx.end, share)) return cell;
  return { ...cell, weak: true, why: `${ctx.end < shiftDays(V260_RELEASED, V260_SETTLE_DAYS) ? "게시 2주 전 · " : ""}보급 ${share ?? "–"}%` };
};
/** 그 날부터 생긴 지표 — 앞 칸은 「~ 전」으로 비우고 합계에서는 0 으로 친다 */
const since = (day: string, why: string, p: Pick): Pick => (c, ctx) => (ctx.end < day ? { v: null, why: `${why}(${md(day)}~)`, pre: true } : p(c, ctx));

interface Def {
  key: string;
  /** 단위와 기간 길이(일)로 이름이 바뀌는 행 — DAU/WAU · 쿠폰 발급 */
  label: string | ((u: RangeUnit, days: number) => string);
  unit: string;
  source: SeriesSource | ((u: RangeUnit) => SeriesSource);
  kind: SeriesKind;
  note: string | ((u: RangeUnit, days: number) => string);
  agg: string | ((u: RangeUnit) => string);
  counts: string;
  sub?: boolean;
  pick: Pick;
  /** 이 단위에서만 싣는다 — 일 단위의 하루 평균은 고유와 같은 값이라 뺀다(S31) */
  units?: RangeUnit[];
  /** 이 기간에서만 싣는다 — 2.6.0 보급률은 2.6.0 이 나온 뒤가 걸친 기간만 */
  when?: (spec: RangeSpec) => boolean;
  /**
   * 「기간 전체」를 무엇으로 낼까. 안 주면 기간을 한 번에 다시 센 값(고유 기기·계정은 칸의 합이 아니다).
   *  - sum: 칸의 합(겹치지 않는 건수)
   *  - mean: 끝난 칸 값의 평균 — 기간을 한 번에 세면 창이 길어져 다른 지표가 된다(DAU/WAU, 1016 검토)
   *  - pooled: 칸의 분자 합 ÷ 분모 합 — 계측이 중간에 생긴 비율(사용 시도 성공률, S6)
   */
  total?: "sum" | "mean" | "pooled";
}

const UNIT_ACTIVE: Record<RangeUnit, string> = { day: "그날", week: "그 주", month: "그 달" };

/**
 * 끈적함의 이름 — 분모 창의 길이를 따른다. 주 칸은 DAU/WAU, 월 칸은 DAU/MAU.
 * 일 단위는 칸마다 못 세고 기간 전체 한 창만 있으니 그 창 길이로 부른다 — 4주를 「DAU/WAU」라 부르지 않는다.
 */
const stickinessName = (u: RangeUnit, days: number) =>
  u === "week" || (u === "day" && days === 7) ? "DAU/WAU" : u === "month" || (days >= 28 && days <= 31) ? "DAU/MAU" : `DAU ÷ ${days}일 활성`;

/** 기간 전체를 한 창으로 셀 때 하위 창(코호트·배너)을 기간 안에서 잡는가 — appSeries 의 totalSub 와 같은 기준 */
const totalInPeriod = (days: number) => days >= 28;

const GROUPS: { key: string; title: string; defs: Def[] }[] = [
  {
    key: "usage",
    title: "앱 이용",
    defs: [
      {
        key: "active", label: "활성 기기 (고유)", unit: "대", source: "ga4", kind: "count", agg: "칸 안 고유", counts: "기기",
        note: (u) => `${UNIT_ACTIVE[u]} 앱을 켠 기기 수(user_engagement) — 칸 안에서 한 번만 셉니다. 재설치하면 새 기기로 셉니다`,
        pick: fromGa4((g) => num(g.wau)),
      },
      {
        key: "new_devices", label: "처음 온 기기", unit: "대", source: "ga4", kind: "count", agg: "칸 안 고유", counts: "기기", sub: true,
        note: "활성 기기 중 같은 칸 안에 처음 앱을 연(first_open) 기기",
        pick: fromGa4((g) => num(g.new_devices)),
      },
      {
        key: "returning", label: "다시 온 기기", unit: "대", source: "ga4", kind: "count", agg: "칸 안 고유", counts: "기기", sub: true,
        note: "활성 기기 − 처음 온 기기. 활성이 뛴 칸이 「새로 온 것」인지 「돌아온 것」인지 가릅니다",
        pick: fromGa4((g) => (g.wau !== null && g.new_devices !== null && g.wau >= g.new_devices ? { v: g.wau - g.new_devices } : { v: null, why: "못 셈" })),
      },
      {
        key: "dau", label: "활성 기기 (하루 평균)", unit: "대", source: "ga4", kind: "avg", agg: "하루 평균", counts: "기기", units: ["week", "month"],
        note: "칸 안의 하루 활성 기기 평균 — 사용자가 없던 날도 하루로 셉니다. 일 단위에서는 「활성 기기 (고유)」와 같은 값이라 싣지 않습니다",
        pick: fromGa4((g) => num(g.dau)),
      },
      {
        key: "stickiness", label: stickinessName, unit: "%", source: "ga4", kind: "rate", agg: "하루 평균 ÷ 칸 고유", counts: "기기",
        note: (u, days) => u === "day"
          ? `기간의 하루 평균 활성 ÷ 기간 ${days}일 동안의 고유 기기. 창이 길수록 분모가 커져 낮게 나옵니다`
          : u === "week"
            ? "하루 평균 활성 ÷ 그 주 고유 기기. 기간 전체는 끝난 주들의 평균"
            : "하루 평균 활성 ÷ 그 달 고유 기기. 분모가 한 달이라 DAU/WAU 보다 훨씬 낮게 나옵니다. 기간 전체는 끝난 달들의 평균",
        pick: notDaily(fromGa4((g) => (g.wau ? { ...rate(g.dau ?? null, g.wau), v: g.dau_wau } : { v: null, why: "표본 없음" }))),
        total: "mean",
      },
      {
        key: "mau", label: "30일 활성", unit: "대", source: "ga4", kind: "count", agg: "끝 날에서 30일 고유", counts: "기기",
        note: "칸의 끝 날에서 거꾸로 30일간 앱을 켠 기기 수",
        pick: fromGa4((g) => num(g.mau)),
      },
      {
        key: "app_v260", label: "앱 2.6.0 이상 기기 비율", unit: "%", source: "ga4", kind: "rate", agg: "칸 안 고유 중", counts: "기기",
        note: "칸 안에 앱을 켠 기기 중 2.6.0 이상으로 한 번이라도 켠 기기. 쿠폰 받기 · 목록 노출 같은 2.6.0 지표는 이 비율이 50% 를 넘고 게시 2주가 지난 칸부터 판정에 씁니다",
        when: (spec) => spec.end >= V260_RELEASED,
        pick: since(V260_RELEASED, "출시 전", fromGa4((g) => (g.app_v260 ? rate(g.app_v260.devices, g.app_v260.active) : { v: null, why: "못 셈" }))),
      },
      {
        key: "retention_w1", label: "첫 실행 기기 1주 후 복귀", unit: "%", source: "ga4", kind: "rate", counts: "기기",
        agg: (u) => (u === "month" ? "그 달 코호트" : "최근 4주 코호트"),
        note: (u, days) => `${u === "month"
          ? "그 달 첫 실행(말일 13일 전까지) 기기 중 7~13일째 다시 켠 비율"
          : "끝 날에서 14~41일 전(4주) 첫 실행 기기 중 7~13일째 다시 켠 비율 — 한 주 코호트는 열 대 남짓이라 4주를 묶습니다"}. 칸마다 코호트 날짜와 기기 수를 붙입니다(BigQuery GA4). 기간 전체는 ${totalInPeriod(days) ? "기간 안 첫 실행(끝 날 13일 전까지)" : "끝 날에서 거꾸로 잡은 창"}`,
        pick: notDaily(fromGa4((g) => ({
          ...rate(g.cohort.returned ?? (g.retention_w1 === null ? null : Math.round((g.retention_w1 * g.cohort.users) / 100)), g.cohort.users),
          span: `${mdIso(g.cohort.from)}~${mdIso(g.cohort.to)} 첫 실행 ${g.cohort.users}대`,
        }))),
      },
      {
        key: "signups", label: "가입", unit: "명", source: "backend", kind: "count", agg: "합", counts: "계정", total: "sum",
        note: "새로 만든 계정 — 직원 제외. 지금 다시 센 값이라 그 뒤 탈퇴한 계정은 빠집니다",
        pick: fromDb("signups"),
      },
      {
        key: "login_start", label: "가입 퍼널 · 로그인 시작", unit: "대", source: "ga4", kind: "count", agg: "칸 안 고유", counts: "기기",
        note: "로그인을 시작한(login_start) 기기 — 처음 온 기기와 가입 계정 사이를 잇습니다",
        pick: fromGa4((g) => (g.signup_funnel ? { v: g.signup_funnel.login_start } : { v: null, why: "못 셈" })),
      },
      {
        key: "login_completed", label: "가입 퍼널 · 로그인 완료", unit: "대", source: "ga4", kind: "count", agg: "칸 안 고유", counts: "기기",
        note: "로그인을 마친(login_completed) 기기",
        pick: fromGa4((g) => (g.signup_funnel ? { v: g.signup_funnel.login_completed } : { v: null, why: "못 셈" })),
      },
      {
        key: "signup_completed", label: "가입 퍼널 · 가입 완료", unit: "대", source: "ga4", kind: "count", agg: "칸 안 고유", counts: "기기",
        note: "가입 완료(user_signup_completed)를 보낸 기기. DB 가입(계정)과는 기기·계정 차이와 탈퇴만큼 다릅니다",
        pick: fromGa4((g) => (g.signup_funnel ? { v: g.signup_funnel.signup_completed } : { v: null, why: "못 셈" })),
      },
    ],
  },
  {
    key: "funnel",
    title: "찾기 퍼널",
    defs: [
      {
        key: "sessions", label: "앱 열기 세션", unit: "세션", source: "ga4", kind: "count", agg: "합", counts: "세션",
        note: "SDK 세션(ga_session_id) 중 session_start 가 있는 세션",
        pick: fromGa4((g) => num(g.sessions)),
      },
      {
        key: "detail_sessions", label: "매장 상세를 연 세션", unit: "세션", source: "ga4", kind: "count", agg: "합", counts: "세션", sub: true,
        note: "같은 세션 안에 restaurant_detail_open 이 있는 세션",
        pick: needs("restaurant_detail_open", fromGa4((g) => num(detailSessions(g)))),
      },
      {
        key: "coupon_sessions", label: "그 자리에서 쿠폰 받은 세션", unit: "세션", source: "ga4", kind: "count", agg: "합", counts: "세션", sub: true,
        note: "그 매장 상세를 연 세션에서 같은 매장 쿠폰을 받은 세션. 캠페인 자동 지급은 뺍니다",
        pick: needs("restaurant_detail_open", fromGa4((g) => num(g.sessions_detail_to_coupon))),
      },
      {
        key: "open_to_store", label: "앱 열기 → 매장 상세", unit: "%", source: "ga4", kind: "rate", agg: "세션 비율", counts: "세션",
        note: "앱 열기 세션 중 매장 상세를 연 비율",
        pick: needs("restaurant_detail_open", fromGa4((g) => rate(detailSessions(g), g.sessions))),
      },
      {
        key: "store_to_coupon", label: "매장 상세 → 그 자리 쿠폰", unit: "%", source: "ga4", kind: "rate", agg: "세션 비율", counts: "세션",
        note: "매장 상세를 연 세션 중 같은 세션에 그 매장 쿠폰(캠페인 외)을 받은 세션 — 위 두 줄의 비율입니다. 예전 값(9월 3.5%)은 분모가 기기·세션·매장 조합이라 다시 셀 수 없어 세션 기준으로 바꿨습니다",
        pick: needs("restaurant_detail_open", fromGa4((g) => rate(g.sessions_detail_to_coupon, detailSessions(g)))),
      },
      {
        key: "list_ctr", label: "매장 목록 카드 → 클릭", unit: "%", source: "ga4", kind: "rate", agg: "카드 비율", counts: "카드 노출",
        note: "매장 목록에서 카드가 보인(절반 이상 · 1초) 세션·매장 중 같은 세션에 그 카드를 누른 비율. 노출은 앱 2.6.0 부터라 그 기기만 셉니다",
        pick: needs("restaurant_list_impression", after260(fromGa4((g) => {
          if (!g.list_view) return { v: null, why: "못 셈" };
          return g.list_view.seen === 0 ? { v: null, why: "노출 이벤트 없음", n: 0 } : rate(g.list_view.clicked, g.list_view.seen);
        }))),
      },
    ],
  },
  {
    key: "coupon",
    title: "쿠폰 · 매장 이용",
    defs: [
      {
        key: "coupon_issued", label: (u) => (u === "month" ? "쿠폰 발급 (월말 스냅샷)" : "처음 받은 쿠폰"), unit: "장",
        source: (u) => (u === "month" ? "snapshot" : "ga4"), kind: "count", agg: "합", counts: "쿠폰", total: "sum",
        note: (u) => u === "month"
          ? "월말 스냅샷(DB)에 굳은 그 달 발급 수 — 취소 제외. 스냅샷이 없는 달은 지금 다시 센 값이라 만료 쿠폰 삭제만큼 줄어 있을 수 있습니다"
          : "GA4 「처음 받은 쿠폰」(캠페인 외 + 캠페인) — DB 발급은 만료 쿠폰이 지워져 다시 셀 때마다 줄어서 일·주 칸은 GA4 로 셉니다. 월 칸은 월말 스냅샷입니다",
        pick: (c, ctx) => (ctx.unit === "month"
          ? fromSnapOr("coupon_issued", fromDb("coupon_issued"))(c, ctx)
          : fromUse((f) => ({ v: f.organic.issued + f.campaign.issued }))(c, ctx)),
      },
      {
        key: "coupon_used", label: "쿠폰 사용", unit: "건", source: "backend", kind: "count", agg: "합", counts: "쿠폰", total: "sum",
        note: "매장에서 사용 처리된 날 기준 — 그 전에 받은 쿠폰도 셉니다. 개발자 테스트 계정은 계정째 뺀 값입니다",
        pick: fromDb("coupon_redeemed"),
      },
      {
        key: "users_redeemed", label: "매장 이용 계정", unit: "명", source: "backend", kind: "count", agg: "칸 안 고유", counts: "계정",
        note: "칸 안에서 매장에서 쿠폰을 쓰거나 스탬프를 받은 계정 수 — 여러 번 써도 1명. 기간 전체는 칸의 합이 아니라 기간을 한 번에 센 고유 계정입니다",
        pick: fromDb("users_redeemed"),
      },
      {
        key: "coupon_users", label: "쿠폰 쓴 계정", unit: "명", source: "backend", kind: "count", agg: "칸 안 고유", counts: "계정", sub: true,
        note: "칸 안에서 쿠폰을 쓴 계정 수", pick: fromDb("coupon_users"),
      },
      {
        key: "stamp_users", label: "스탬프 받은 계정", unit: "명", source: "backend", kind: "count", agg: "칸 안 고유", counts: "계정", sub: true,
        note: "칸 안에서 스탬프를 받은 계정 수", pick: fromDb("stamp_users"),
      },
      {
        key: "active_restaurants", label: "활동 매장", unit: "곳", source: "backend", kind: "count", agg: "칸 안 고유", counts: "매장",
        note: "쿠폰 사용이나 스탬프가 1건 이상인 매장 수 — 제휴를 끈 매장도 셉니다. 제휴 매장 대비는 아래 「활동 제휴 매장 비율」",
        pick: fromDb("active_restaurants"),
      },
      {
        key: "affiliate_stores", label: "제휴 매장", unit: "곳", source: "backend", kind: "count", agg: "지금 값", counts: "매장",
        note: "지금 앱에 제휴로 떠 있는 매장(제휴 켜짐 · 앱에서 숨기지 않음). Probe 는 앱 내부 지표로만 말해 Astro 계약 날짜를 쓰지 않습니다(D8). 앱에 제휴 시작·종료 날짜가 없어 칸마다 같은 값입니다",
        pick: fromAffiliates((a) => ({ v: a.count })),
      },
      {
        key: "affiliate_active_rate", label: "활동 제휴 매장 비율", unit: "%", source: "backend", kind: "rate", agg: "칸 안 고유 ÷ 지금 제휴", counts: "매장", sub: true,
        note: "지금 제휴 매장 중 칸 안에 쿠폰 사용이나 스탬프가 1건 이상인 곳의 비율 — 분모가 지금 목록이라 지난 칸일수록 그 뒤 들어온 매장만큼 낮게 나올 수 있습니다. 활동 0건 매장은 보조표 「활동 0건 제휴 매장」에 있습니다",
        // 표본이 아니라 제휴 매장 전수라 분모 30 미만의 「표본 n」 흐림을 달지 않는다
        pick: fromAffiliates((a) => {
          const c = rate(a.active, a.count);
          return c.v === null ? c : { v: c.v, n: c.n, x: c.x };
        }),
      },
      {
        key: "coupon_claimed", label: "받기 누른 쿠폰", unit: "장", source: "ga4", kind: "count", agg: "합", counts: "쿠폰",
        note: "학생이 「받기」를 눌러 받은 쿠폰 — 한정쿠폰 · 추천코드 · 환영 미션 · 스탬프 보상. 자동 지급은 빠집니다. 앱 2.6.0(10/12~)부터라 보급 중에는 구버전 기기 몫이 빠집니다",
        pick: needs("coupon_claim", after260(fromCoupons((f) => (f.claim ? { v: f.claim.claimed } : { v: null, why: "못 셈" })))),
      },
      {
        key: "claim_to_use", label: `받기 누른 쿠폰 → ${FOLLOW_DAYS}일 사용`, unit: "%", source: "ga4", kind: "rate", agg: `${FOLLOW_DAYS}일 추적`, counts: "쿠폰",
        note: `그 칸에 「받기」로 받은 쿠폰 중 받은 뒤 ${FOLLOW_DAYS}일 안에 쓰인 비율(coupon_code 로 잇습니다). 한정쿠폰도 학생이 고른 것이라 캠페인/그 외를 가르지 않습니다`,
        pick: needs("coupon_claim", after260(fromCoupons((f, ctx) => {
          if (!f.claim) return { v: null, why: "못 셈" };
          if (f.claim.claimed === 0) return { v: null, why: "받기 없음", n: 0 };
          const c = rate(f.claim.redeemed, f.claim.claimed);
          return ctx.through && shiftDays(ctx.end, FOLLOW_DAYS) > ctx.through ? { ...c, weak: true, why: "지켜보는 중" } : c;
        }))),
      },
      {
        key: "wallet_to_use", label: "쿠폰함 → 사용 화면", unit: "%", source: "ga4", kind: "rate", agg: "기기 비율", counts: "기기",
        note: "쿠폰함을 본 기기 중 사용 화면까지 간 비율 (이벤트 8/31~)",
        pick: fromCoupons((f) => (f.coverage.wallet_to_use === "full" ? rate(f.wallet.opened_use, f.wallet.saw) : gap("coupon_use_screen_view", f.coverage.wallet_to_use))),
      },
      {
        key: "redeem_success", label: "사용 시도 성공률", unit: "%", source: "ga4", kind: "rate", agg: "건 비율", counts: "사용 결과", total: "pooled",
        note: "사용 결과(성공+실패) 중 성공. 실패 이벤트가 9/7 에 생겨 그 전 칸은 비웁니다 — 기간 전체는 값이 있는 칸의 성공 합 ÷ 결과 합",
        pick: fromCoupons((f) => (f.coverage.redeem_outcome === "full" ? rate(f.attempt.ok, f.attempt.ok + f.attempt.failed) : gap("coupon_redeem_failed", f.coverage.redeem_outcome))),
      },
    ],
  },
  {
    key: "use",
    title: `쓰기 퍼널 — 처음 받은 쿠폰을 ${FOLLOW_DAYS}일 따라감`,
    defs: (["organic", "campaign"] as const).flatMap((line): Def[] => {
      const name = line === "organic" ? "캠페인 외" : "캠페인";
      const steps = (f: CouponUseFunnel) => f.coverage.steps === "full";
      const stepGap = (f: CouponUseFunnel): Cell => (f.coverage.steps === "partial" ? { v: null, why: "이벤트 중간 배포(8/31~)" } : { v: null, why: "계측 전(8/31~)" });
      return [
        {
          key: `use_${line}_issued`, label: `${name} · 처음 받은 쿠폰`, unit: "장", source: "ga4", kind: "count", agg: "합", counts: "쿠폰",
          note: `그 칸에 처음 받은 ${name} 쿠폰 — 자동 지급 포함. 재설치·다른 기기에서 다시 보인 쿠폰은 처음 받은 날로 셉니다`,
          pick: fromUse((f) => ({ v: f[line].issued })),
        },
        {
          key: `use_${line}_screen`, label: `${name} · 사용 화면`, unit: "장", source: "ga4", kind: "count", agg: "합", counts: "쿠폰", sub: true,
          note: `받은 뒤 ${FOLLOW_DAYS}일 안에 사용 화면을 연 쿠폰(뒤 단계에 간 쿠폰 포함)`,
          pick: fromUse((f) => (steps(f) ? { v: f[line].screen } : stepGap(f))),
        },
        {
          key: `use_${line}_attempt`, label: `${name} · 사용 시도`, unit: "장", source: "ga4", kind: "count", agg: "합", counts: "쿠폰", sub: true,
          note: "사용을 시도한 쿠폰(쓰인 쿠폰 포함)",
          pick: fromUse((f) => (steps(f) ? { v: f[line].attempt } : stepGap(f))),
        },
        {
          key: `use_${line}_redeemed`, label: `${name} · ${FOLLOW_DAYS}일 안에 사용`, unit: "장", source: "ga4", kind: "count", agg: "합", counts: "쿠폰", sub: true,
          note: `받은 뒤 ${FOLLOW_DAYS}일 안에 쓰인 쿠폰. 아직 ${FOLLOW_DAYS}일이 안 지난 쿠폰이 섞인 칸은 흐리게 그립니다`,
          pick: fromUse((f) => (f.maturing > 0 ? { v: f[line].redeemed, weak: true, why: `지켜보는 중 ${f.maturing}장` } : { v: f[line].redeemed })),
        },
        {
          // 「같은 칸 안에」 센 사용률은 일 단위면 받은 날 당일 것만 남는다 — 일별을 합친 값이 기간 전체 열의 3분의 1 남짓이었다(1016 기획팀 검토).
          // 받은 날부터 같은 길이를 따라가면 칸 길이와 상관없이 같은 뜻이다. 1022 부터 쿠폰 사용률은 이것 하나다(S37).
          key: `use_${line}_rate`, label: `${name} · 쿠폰 ${FOLLOW_DAYS}일 사용률`, unit: "%", source: "ga4", kind: "rate", agg: `${FOLLOW_DAYS}일 추적`, counts: "쿠폰", sub: true,
          note: `가입 환영·스탬프 보상·추천·한정 등 그 칸에 처음 받은 ${name} 쿠폰 중 받은 뒤 ${FOLLOW_DAYS}일 안에 쓰인 비율 — 칸 길이와 상관없이 같은 창입니다. 아직 ${FOLLOW_DAYS}일이 안 지난 쿠폰이 섞인 칸은 흐리게 그립니다`,
          pick: fromUse((f) => {
            const x = f[line];
            if (x.issued === 0) return { v: null, why: "발급 없음", n: 0 };
            const c = rate(x.redeemed, x.issued);
            return f.maturing > 0 ? { ...c, weak: true, why: `지켜보는 중 ${f.maturing}장` } : c;
          }),
        },
      ];
    }),
  },
  {
    key: "loyalty",
    title: "스탬프 · 마일리지",
    defs: [
      { key: "stamp_earned", label: "스탬프 적립", unit: "건", source: "backend", kind: "count", agg: "합", counts: "적립", total: "sum", note: "스탬프를 찍은 횟수 — 한 번에 여러 개를 찍어도 1건", pick: fromDb("stamp_earned") },
      { key: "stamp_reward", label: "스탬프 보상 수령", unit: "건", source: "backend", kind: "count", agg: "합", counts: "쿠폰", total: "sum", note: "스탬프를 채워 발급된 보상 쿠폰", pick: fromDb("stamp_reward") },
      {
        key: "qr_visits", label: "QR 방문 적립", unit: "건", source: "backend", kind: "count", agg: "합", counts: "적립", total: "sum",
        note: "매장 QR 을 찍어 마일리지를 받은 건수. 매장 QR 안내(10/18) 전 칸은 비웁니다",
        pick: since("20261018", "QR 안내 전", fromDb("qr_visits")),
      },
      {
        key: "mileage_points_earned", label: "마일리지 적립", unit: "P", source: "backend", kind: "count", agg: "합", counts: "P", total: "sum",
        note: "스탬프 방문 · 쿠폰 사용 · 미션 · QR 방문으로 쌓인 마일리지 합. 관리자 조정은 뺍니다",
        pick: fromDb("mileage_points_earned"),
      },
      {
        key: "mileage_points_spent", label: "마일리지 응모 사용", unit: "P", source: "backend", kind: "count", agg: "합", counts: "P", total: "sum",
        note: "식사권 응모에 쓴 마일리지 합. 응모 · 당첨은 회차 요약에 회차마다 있습니다",
        pick: fromDb("mileage_points_spent"),
      },
    ],
  },
  {
    key: "push",
    title: "푸시 · 배너",
    defs: [
      {
        key: "push_campaigns", label: "푸시 발송 (캠페인 단위)", unit: "회", source: "backend", kind: "count", agg: "합", counts: "발송", total: "sum",
        note: "여러 사람에게 한 번에 나간 알림 + 매장 예약 알림. 한 사람에게만 간 알림(쿠폰 만료 안내 등)과 개발자 테스트는 뺍니다 — 예전 「푸시 발송」(알림 행 수, 9월 991)과 다른 값입니다",
        pick: fromDb("push_campaigns"),
      },
      {
        key: "push_targets", label: "발송 대상(성공)", unit: "명", source: "backend", kind: "count", agg: "합", counts: "계정", sub: true, total: "sum",
        note: "캠페인 알림이 발송에 성공한 대상 수의 합. 매장 예약 알림은 대상 수를 남기지 않아 빠집니다",
        pick: fromDb("push_targets"),
      },
      {
        key: "push_open_devices", label: "푸시 열기 (push_open)", unit: "대", source: "ga4", kind: "count", agg: "칸 안 고유", counts: "기기",
        note: "앱 2.6.0 의 push_open 을 보낸 기기. 캠페인 이름이 아직 대부분 unknown 이라 합계만 냅니다 — 예전 「푸시 → 앱 열기」(안드로이드 notification_open ÷ 수신)를 대신합니다",
        pick: needs("push_open", fromGa4((g) => (typeof g.push_open_devices === "number" ? { v: g.push_open_devices } : { v: null, why: "못 셈" }))),
      },
      {
        key: "banner_ctr", label: "배너 노출 → 클릭", unit: "%", source: "ga4", kind: "rate", agg: "기기 비율", counts: "기기",
        note: "트렌드 가로배너(banner_type=promo)의 노출 이벤트(home_banner_impression, 앱 2.5.8~)를 보낸 기기 중 그 배너도 누른 기기. 기획전 세로배너는 뺍니다",
        pick: fromGa4((g) => ((g.banner_view?.seen ?? 0) === 0 ? { v: null, why: "계측 전 · 앱 2.5.8~ 노출 없음", n: 0 } : rate(g.banner_view!.clicked, g.banner_view!.seen))),
      },
      {
        key: "banner_to_coupon", label: "배너 클릭 → 쿠폰 사용", unit: "%", source: "ga4", kind: "rate", agg: "기기 비율 · 7일 추적", counts: "기기",
        note: (u, days) => `트렌드 가로배너를 누른 기기 중 7일 안에 쿠폰을 쓴 비율. ${u === "month" ? "칸: 그 달 안(클릭은 말일 7일 전까지)" : "칸: 끝 날 7일 전까지 4주치 클릭"} · 기간 전체: ${totalInPeriod(days) ? "기간 안(클릭은 끝 날 7일 전까지)" : "끝 날 7일 전까지 4주치 클릭"}. 칸마다 실제 클릭 창을 붙입니다`,
        pick: notDaily(fromGa4((g) => ({ ...rate(g.banner.redeemed, g.banner.clicked), span: `클릭 ${mdIso(g.banner.from)}~${mdIso(g.banner.to)}` }))),
      },
    ],
  },
];

/** 주요 지표 보고서가 행을 키로 찾는다 */
export const SERIES_KEYS = GROUPS.flatMap((g) => g.defs.map((d) => d.key));

/** 칸의 합 — 칸이 기간을 겹침 없이 나누므로(반열린 구간) 합이 곧 기간 값이다. 지표가 생기기 전 칸은 0 으로 친다 */
function sumCells(cells: Cell[]): Cell {
  if (cells.some((c) => c.v === null && !c.pre)) return { v: null, why: "일부 칸 못 읽음" };
  return { v: cells.reduce((a, c) => a + (c.v ?? 0), 0) };
}

/** 끝난 칸 값의 평균(mean). 끝난 칸이 하나도 없으면 null — 부르는 쪽이 기간 전체로 센다 */
function meanCells(cells: Cell[], buckets: SeriesBucket[], unit: RangeUnit): Cell | null {
  const done = cells.filter((c, i) => !buckets[i].open && c.v !== null);
  if (!done.length) return null;
  if (done.length === 1) return done[0];
  const v = Math.round((done.reduce((a, c) => a + (c.v as number), 0) / done.length) * 10) / 10;
  return { v, why: `${unit === "month" ? "달" : "주"} ${done.length}개 평균` };
}

/** 값이 있는 칸의 분자 합 ÷ 분모 합(pooled) */
function pooledCells(cells: Cell[]): Cell {
  const have = cells.filter((c) => c.v !== null && typeof c.x === "number" && typeof c.n === "number");
  const n = have.reduce((a, c) => a + (c.n as number), 0);
  const c = rate(have.reduce((a, c) => a + (c.x as number), 0), n);
  return have.length < cells.length && c.v !== null ? { ...c, why: `${c.why ? `${c.why} · ` : ""}값 있는 ${have.length}칸 합` } : c;
}

const pickLabel = (d: Def, unit: RangeUnit, days: number) => (typeof d.label === "function" ? d.label(unit, days) : d.label);

/** 평시 기준선 창 하나 — KPI 에 쓰는 행만 같은 정의로 센다(주 칸과 같은 창 규칙) */
export function windowCells(input: CellInput, start: string, end: string, through: string | null, keys: string[]): Record<string, Cell> {
  const ctx: Ctx = { unit: "week", total: false, start, end, through };
  const out: Record<string, Cell> = {};
  for (const g of GROUPS) for (const d of g.defs) if (keys.includes(d.key)) out[d.key] = d.pick(input, ctx);
  return out;
}

export interface SeriesInput {
  spec: RangeSpec;
  through: string | null;
  /** KST 오늘 — YYYYMMDD */
  today: string;
  /** KST "YYYY-MM-DD HH:mm" — 안 주면 지금 */
  generatedAt?: string;
  cells: CellInput[];
  /** 「기간 전체」를 한 번에 센 것. db 는 칸을 더할 수 없는 값만 쓴다(92일 넘는 기간은 백엔드가 못 세 null) */
  total: CellInput;
  warnings?: string[];
  events?: AppEvent[];
  eventsOk?: boolean;
  baseline?: { fixed: BaseWindow[]; weeks: BaseWindow[] };
  dbAt?: string | null;
  revision?: string;
  rounds?: RaffleRound[] | null;
}

export function buildSeries({ spec, through, today, generatedAt, cells, total, warnings = [], events = [], eventsOk = false, baseline = { fixed: [], weeks: [] }, dbAt = null, revision = "local", rounds = null }: SeriesInput): AppSeries {
  if (cells.length !== spec.buckets.length) throw new Error(`칸 수가 맞지 않습니다 — 기간 ${spec.buckets.length}칸, 읽은 값 ${cells.length}칸`);
  const unit = spec.unit;
  const buckets: SeriesBucket[] = spec.buckets.map((b) => ({ ...b, open: through ? b.end > through : b.end >= today }));
  const exclusions: string[] = [ACCOUNT_EXCLUSION];

  const groups: SeriesGroup[] = GROUPS.map((g) => ({
    key: g.key,
    title: g.title,
    rows: g.defs
      .filter((d) => (!d.units || d.units.includes(unit)) && (!d.when || d.when(spec)))
      .map((d): SeriesRow => {
        const row = cells.map((c, i) => d.pick(c, { unit, total: false, start: spec.buckets[i].start, end: spec.buckets[i].end, through }));
        // 손으로 뺀 값(D9) — 그날이 든 칸에서 덜어 내고, 덜어 냈다고 적는다
        for (const ex of EXCLUSIONS.filter((e) => e.key === d.key)) {
          const i = spec.buckets.findIndex((b) => b.start <= ex.day && ex.day <= b.end);
          const c = row[i];
          if (i < 0 || !c || c.v === null) continue;
          row[i] = { ...c, v: Math.max(0, c.v - ex.n), why: `${md(ex.day)} ${ex.n}건 뺌 · ${ex.why}` };
          exclusions.push(`${md(ex.day)} ${pickLabel(d, unit, spec.days)} −${ex.n} · ${ex.why}`);
        }
        const whole = () => d.pick(total, { unit, total: true, start: spec.start, end: spec.end, through });
        return {
          key: d.key,
          label: pickLabel(d, unit, spec.days),
          unit: d.unit,
          source: typeof d.source === "function" ? d.source(unit) : d.source,
          kind: d.kind,
          note: typeof d.note === "function" ? d.note(unit, spec.days) : d.note,
          ...(d.sub ? { sub: true } : {}),
          agg: typeof d.agg === "function" ? d.agg(unit) : d.agg,
          counts: d.counts,
          cells: row,
          total: d.total === "sum" ? sumCells(row) : d.total === "mean" ? meanCells(row, buckets, unit) ?? whole() : d.total === "pooled" ? pooledCells(row) : whole(),
        };
      }),
  }));

  const anyOpen = buckets.some((b) => b.open);
  const caveats = [
    `**주 단위 칸은 주간 보고서, 월 단위 칸은 월간 보고서와 같은 정의로 셉니다(GA4).** 단 복귀는 주 칸이면 4주 코호트입니다. DB 칸은 지금 다시 센 값이라 그 사이 탈퇴만큼 줄 수 있고, 쿠폰 발급은 ${unit === "month" ? "월말 스냅샷(굳힌 값)" : "GA4 「처음 받은 쿠폰」"}입니다.`,
    "**기기는 「대」, 계정은 「명」입니다.** GA4 지표는 기기 단위라 재설치하면 새 기기로 셉니다. DB 지표(가입 · 매장 이용 계정)는 계정 단위입니다.",
    unit === "day"
      ? "**「기간 전체」 열의 고유 기기·계정과 비율은 칸을 더한 값이 아니라 기간을 한 번에 다시 센 값입니다.** 건수만 칸의 합입니다."
      : `**「기간 전체」 열의 고유 기기·계정과 비율은 칸을 더한 값이 아니라 기간을 한 번에 다시 센 값입니다.** 건수는 칸의 합, ${unit === "month" ? "DAU/MAU" : "DAU/WAU"} 는 끝난 칸의 평균입니다 — 한 창으로 세면 분모가 기간 전체 고유 기기가 되어 다른 지표가 됩니다.`,
    unit === "day"
      ? `**일 단위에서는 끈적함 · 복귀 · 배너 클릭 → 쿠폰을 세지 않습니다** — 관찰 창이 하루보다 깁니다. 「기간 전체」 열에는 있습니다. 끈적함은 기간 ${spec.days}일을 한 창으로 센 값이라 이름이 「${stickinessName(unit, spec.days)}」입니다.`
      : unit === "week"
        ? "**주 단위의 복귀 · 배너 클릭 → 쿠폰은 끝 날에서 거꾸로 잡은 고정 창입니다**(첫 실행 14~41일 전 · 클릭 4주). 칸마다 실제 창을 붙였습니다."
        : "**월 단위의 복귀 · 배너 클릭 → 쿠폰은 그 달 안에서 잡습니다** — 월간 보고서와 같습니다. 칸마다 실제 창을 붙였습니다.",
    `**쿠폰 사용률은 「처음 받은 쿠폰의 ${FOLLOW_DAYS}일 사용률」 하나입니다**(쓰기 퍼널). 끝 쪽 칸은 ${FOLLOW_DAYS}일이 안 지난 쿠폰이 섞여 낮게 나올 수 있습니다(흐린 숫자).`,
    "**빈 칸(–)은 0 이 아닙니다.** 이유가 「빈칸 사유」 열과 칸 툴팁에 있습니다 — 못 읽음 · 계측 전 · 발급 없음 · 일 단위 없음 · 집계 전 · 백엔드 미반영.",
    "**흐린 숫자**는 표본 30 미만이거나 아직 지켜보는 중 · 앱 2.6.0 보급 전인 값입니다. 판정 근거로 쓰기엔 모자랍니다.",
    "**KPI 묶음값과 판정 사유는 「주요 지표」 보고서에만 있습니다.** 여기는 칸 값과 정의만 둡니다.",
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
    events,
    eventsOk,
    baseline,
    dbAt,
    revision,
    exclusions,
    rounds,
    long: longRows(spec, cells),
  };
}

/** 키로 행 하나 — 주요 지표 보고서 */
export function seriesRow(s: AppSeries, key: string): SeriesRow | null {
  for (const g of s.groups) for (const r of g.rows) if (r.key === key) return r;
  return null;
}
