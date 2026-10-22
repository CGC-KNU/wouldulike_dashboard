import { unstable_cache } from "next/cache";
import { readGa4AppMetrics, readLastEventDate, type Ga4AppMetrics } from "@/lib/bigquery/appMetrics";
import { readCouponFunnel, readCouponUseFunnel, type CouponFunnel, type CouponUseFunnel } from "@/lib/bigquery/couponFunnel";
import type { BackendFetch } from "./appReport";
import type { PeriodStats } from "./appReportData";
import { CALM_FIXED, CALM_WEEKS_FROM, campaignEvents, eventsIn, FIXED_EVENTS, type AppEvent } from "./appEvents";
import { dashed, kstToday, shiftDays, unitStart, type RangeSpec } from "./appRange";
import { buildSeries, windowCells, type AppSeries, type BaseWindow, type CellInput, type RaffleRound, type SnapshotRow } from "./appSeriesData";
import type { CampaignWeek } from "./campaigns";
import { fetchBackendJson } from "./toolProxy";

/**
 * Probe · 앱 지표 **기간 × 단위** 표 가져오기 — 칸마다 주간·월간 보고서와 **같은 함수**를 그 창으로 부른다(민찬 1015).
 *
 * 새 SQL 을 만들지 않은 까닭: 정의가 두 벌이 되면 같은 주를 두 곳에서 다르게 읽는다. 대신 칸 수만큼 부른다.
 * 32칸(3월~ 전체 주)을 같이 쏴서 GA4 9초 · 쿠폰 퍼널 5초(1015 로컬 실측) — 한 칸을 부를 때와 거의 같다.
 * 칸마다 BigQuery 를 열다섯 번쯤 부르므로(쿼리당 최소 과금 10MB) 지난 칸은 캐시한다.
 *
 *  - GA4: 주·일 단위는 끝 날에서 거꾸로 잡는 고정 창(anchored) — 주간 보고서와 같다. 월 단위는 그 달 안(in-period) — 월간 보고서와 같다.
 *    복귀 코호트만 4주로 넓힌다(1022 기획팀 검토 R10 — 한 주 코호트는 열 대 남짓).
 *  - DB: 백엔드 `app-stats/period`(KST, 끝 날 포함, 92일까지)를 칸마다. 동시에 6개까지만 — Koyeb 한 대가 받는다.
 *    월 칸의 쿠폰 발급은 월말 스냅샷(`metric-snapshots`)을 읽는다(D10).
 *  - 「기간 전체」: GA4·쿠폰 퍼널은 기간을 한 번에 다시 센다(고유 기기는 칸의 합이 아니다). DB 건수는 칸의 합이고,
 *    고유 계정·매장만 기간 전체로 한 번 더 부른다(92일 넘으면 백엔드가 거절해 비운다).
 *  - 사건: 캠페인 주간은 app-stats/period 응답에 실려 온다(Astro 달력과 같은 표). 공휴일·릴리스는 appEvents.
 *  - 평시 기준선: 9/1~14 두 주와, 그 뒤 사건 없는 주를 따로 센다(KPI 판정 · 기준선 점선).
 */

const withCookie: BackendFetch = (path, search) => fetchBackendJson(path, search, true);

/** 확정 테이블은 1~3일 뒤까지 고쳐진다 — 그보다 지난 창만 오래 캐시한다 */
const settled = (end: string, through: string | null) => !!through && shiftDays(end, 3) <= through;

const unwrap = <T>(r: { ok: true; data: T } | { ok: false; reason: string; detail?: string }): T => {
  if (!r.ok) throw new Error(r.reason === "no_key" ? "GCP_SA_KEY 미설정" : r.detail ?? "조회 실패");
  return r.data;
};

/** 복귀 코호트 길이(anchored) — 주 칸은 4주 */
const COHORT_DAYS = 28;

type Sub = "anchored" | "in-period";
const readGa4 = async (start: string, end: string, sub: Sub) => unwrap(await readGa4AppMetrics(process.env, { start, end, subWindows: sub, cohortDays: COHORT_DAYS }));
// 받기 → 사용은 받은 뒤 7일까지 읽는다 — through 가 바뀌면 값이 바뀌므로 캐시 키에 넣는다
const readCoupons = async (start: string, end: string, through: string) => unwrap(await readCouponFunnel(process.env, { start, end, follow: { through } }));
// 쓰기 퍼널은 「발급 + 7일」까지 읽는다 — 마찬가지
const readUse = async (start: string, end: string, through: string) => unwrap(await readCouponUseFunnel(process.env, { start, end, through }));

// 성공만 캐시된다 — 실패는 throw 로 빠져나가 캐시에 남지 않는다(/api/probe/app 과 같은 방식)
// 키를 v2 로 올린 까닭: GA4 응답에 보급률·가입 퍼널이 늘고 코호트가 4주가 됐다(1022)
const LONG = 7 * 24 * 3600;
const SHORT = 3 * 3600;
const cache = {
  ga4: { long: unstable_cache(readGa4, ["app-series-ga4-v2"], { revalidate: LONG }), short: unstable_cache(readGa4, ["app-series-ga4-v2s"], { revalidate: SHORT }) },
  coupons: { long: unstable_cache(readCoupons, ["app-series-coupons-v2"], { revalidate: LONG }), short: unstable_cache(readCoupons, ["app-series-coupons-v2s"], { revalidate: SHORT }) },
  use: { long: unstable_cache(readUse, ["app-series-use-v1"], { revalidate: LONG }), short: unstable_cache(readUse, ["app-series-use-v1s"], { revalidate: SHORT }) },
};

/** 동시에 n 개까지만 돌린다 — 순서는 그대로 */
async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/** 실패를 null 로 — 무엇이 몇 칸 실패했는지는 따로 센다 */
async function attempt<T>(job: () => Promise<T>, fails: Map<string, number>, what: string, detail: Set<string>): Promise<T | null> {
  try {
    return await job();
  } catch (e) {
    fails.set(what, (fails.get(what) ?? 0) + 1);
    if (e instanceof Error) detail.add(e.message.slice(0, 120));
    return null;
  }
}

/** 평시 기준선이 쓰는 행 — KPI 와 구성비 규칙 */
const BASE_KEYS = ["active", "new_devices", "returning", "dau", "signups", "users_redeemed", "open_to_store", "coupon_used", "stamp_earned"];
/** 평시 주는 최근 것부터 이만큼만 센다 — 판정은 넷까지만 쓰고, 앞 칸 판정을 위해 조금 더 */
const CALM_WEEKS_FETCH = 8;

/**
 * 사건 없는 주(월~일) — 고정 기준선 뒤부터, 확정 테이블 안에서. 최근 것부터 CALM_WEEKS_FETCH 개.
 * 사건 표를 못 읽었으면 빈 목록이다 — 캠페인 주를 평시로 착각하지 않게.
 */
export function calmWeeks(events: AppEvent[], eventsOk: boolean, until: string, through: string | null): { start: string; end: string }[] {
  if (!eventsOk || !through) return [];
  const out: { start: string; end: string }[] = [];
  for (let s = unitStart(shiftDays(CALM_WEEKS_FROM, 6), "week"); s <= until; s = shiftDays(s, 7)) {
    const e = shiftDays(s, 6);
    if (s < CALM_WEEKS_FROM || e > through || e > until) continue;
    if (!eventsIn(events, s, e).length) out.push({ start: s, end: e });
  }
  return out.slice(-CALM_WEEKS_FETCH);
}

/** "2026-10-22T18:54:03+09:00" → "2026-10-22 18:54" */
const kstMinute = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + 9 * 3_600_000).toISOString().slice(0, 16).replace("T", " ") : null;
};

export async function buildAppSeries(spec: RangeSpec, opts: { fetchJson?: BackendFetch } = {}): Promise<AppSeries> {
  const fetchJson = opts.fetchJson ?? withCookie;
  const today = kstToday();
  const through = await readLastEventDate().catch(() => null);
  const sub: Sub = spec.unit === "month" ? "in-period" : "anchored";
  // 기간 전체 — 한 달 이상이면 월간 보고서처럼 그 안에서, 짧으면 주간 보고서처럼 끝에서 거꾸로
  const totalSub: Sub = spec.days >= 28 ? "in-period" : "anchored";

  const fails = new Map<string, number>();
  const detail = new Set<string>();

  /** 창 하나의 GA4 묶음(지표 · 쿠폰 퍼널 · 쓰기 퍼널). onlyGa4 면 지표만 — 평시 기준선 */
  const ga4Window = async (start: string, end: string, s: Sub, onlyGa4 = false): Promise<Omit<CellInput, "db">> => {
    // 확정 테이블보다 뒤에서 시작하는 칸(오늘 같은) — 읽을 것이 없다. 「못 읽음」이 아니라 「집계 전」
    if (!through || start > through) return { ga4: null, coupons: null, use: null, ga4Pending: !!through };
    const pick = settled(end, through) ? "long" : "short";
    // 쓰기 퍼널 · 받기 → 사용은 발급 뒤 7일까지 봐야 굳는다
    const followPick = settled(shiftDays(end, 7), through) ? "long" : "short";
    const capped = end > through ? through : end;
    const [ga4, coupons, use] = await Promise.all([
      attempt(() => cache.ga4[pick](start, end, s) as Promise<Ga4AppMetrics>, fails, "GA4 지표", detail),
      onlyGa4 ? null : attempt(() => cache.coupons[followPick](start, capped, through) as Promise<CouponFunnel>, fails, "쿠폰 퍼널", detail),
      onlyGa4 ? null : attempt(() => cache.use[followPick](start, capped, through) as Promise<CouponUseFunnel>, fails, "쓰기 퍼널", detail),
    ]);
    return { ga4, coupons, use };
  };

  const dbWindow = (start: string, end: string) =>
    fetchJson<PeriodStats>("/api/dashboard/admin/app-stats/period/", `start=${dashed(start)}&end=${dashed(end)}`);
  // 월 칸 — 앱 전체 스냅샷과 매장별 스냅샷을 한 번에(매장 × 월 보조표, S8)
  const snapshot = async (period: string): Promise<{ snap: SnapshotRow | null; stores: Record<string, Record<string, number | null>> | null }> => {
    const r = await fetchJson<{ current?: SnapshotRow | null; restaurants?: Record<string, Record<string, number | null>> }>("/api/dashboard/admin/metric-snapshots/", `period=${period}&restaurants=1`);
    return { snap: r?.current ?? null, stores: r?.restaurants ?? null };
  };

  const [ga4Cells, totalGa4, dbFirst, totalDb, snaps, roundsRes] = await Promise.all([
    pool(spec.buckets, 32, (b) => ga4Window(b.start, b.end, sub)),
    ga4Window(spec.start, spec.end, totalSub),
    pool(spec.buckets, 6, (b) => dbWindow(b.start, b.end)),
    spec.days <= 92 ? dbWindow(spec.start, spec.end) : Promise.resolve(null),
    spec.unit === "month" ? pool(spec.buckets, 6, (b) => snapshot(`${b.start.slice(0, 4)}-${b.start.slice(4, 6)}`)) : Promise.resolve(spec.buckets.map(() => ({ snap: null, stores: null }))),
    fetchJson<{ rounds?: RaffleRound[] }>("/api/dashboard/admin/app-stats/raffles/", `start=${dashed(spec.start)}&end=${dashed(spec.end)}`),
  ]);

  // 백엔드가 잠들어 있으면 첫 요청이 503 이다(Koyeb) — 못 읽은 칸만 한 번 더
  const db = await pool(dbFirst, 6, async (d, i) => d ?? (await dbWindow(spec.buckets[i].start, spec.buckets[i].end)));

  // 사건 — 캠페인 주간은 DB 응답에 실려 온다. 한 칸이라도 실려 왔으면 표를 읽은 것이다
  const weeks = [totalDb, ...db].find((d) => Array.isArray(d?.campaigns))?.campaigns as CampaignWeek[] | undefined;
  const eventsOk = Array.isArray(weeks);
  const events = [...FIXED_EVENTS, ...campaignEvents(weeks ?? [])].sort((a, b) => a.start.localeCompare(b.start));

  // 평시 기준선 — 9/1~14 두 주 + 그 뒤 사건 없는 주. 일 단위는 판정하지 않지만 그래프의 평시 점선에 쓴다
  const baseline: { fixed: BaseWindow[]; weeks: BaseWindow[] } = { fixed: [], weeks: [] };
  if (through) {
    const fixed = CALM_FIXED.filter((w) => w.end <= through);
    const calm = calmWeeks(events, eventsOk, spec.end, through);
    const wins = [...fixed, ...calm];
    const read = await pool(wins, 6, async (w) => {
      const [g, d] = await Promise.all([ga4Window(w.start, w.end, "anchored", true), dbWindow(w.start, w.end)]);
      return { start: w.start, end: w.end, cells: windowCells({ ...g, db: d }, w.start, w.end, through, BASE_KEYS) };
    });
    baseline.fixed = read.slice(0, fixed.length);
    baseline.weeks = read.slice(fixed.length);
  }

  const warnings: string[] = [];
  if (!through) warnings.push("GA4 확정 테이블을 읽지 못했습니다 (GCP_SA_KEY 확인) — GA4 칸이 모두 비었습니다.");
  for (const [what, n] of fails) warnings.push(`${what}을(를) ${n}개 창에서 읽지 못했습니다${detail.size ? ` — ${[...detail][0]}` : ""}`);
  const dbMissed = db.filter((d) => !d?.stats).length;
  if (dbMissed) warnings.push(`백엔드 집계(app-stats/period)를 ${dbMissed}칸 읽지 못했습니다 — DB 칸이 비었습니다.`);
  if (!eventsOk) warnings.push("캠페인 주간 표(Astro)를 읽지 못했습니다 — KPI 판정을 모두 미뤘습니다.");
  if (spec.unit === "month" && snaps.some((s) => !s.snap)) warnings.push(`월말 스냅샷이 없는 달이 ${snaps.filter((s) => !s.snap).length}개 있습니다 — 그 달 쿠폰 발급은 지금 다시 센 값입니다.`);

  const dbAt = [totalDb, ...db].map((d) => (d?.generated_at ? kstMinute(d.generated_at) : null)).filter((t): t is string => !!t).sort().pop() ?? null;

  return buildSeries({
    spec,
    through,
    today,
    cells: ga4Cells.map((g, i) => ({ ...g, db: db[i] ?? null, snap: snaps[i]?.snap ?? null, stores: snaps[i]?.stores ?? null })),
    total: { ...totalGa4, db: totalDb ?? null },
    warnings,
    events,
    eventsOk,
    baseline,
    dbAt,
    revision: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
    rounds: Array.isArray(roundsRes?.rounds) ? roundsRes.rounds : null,
  });
}
