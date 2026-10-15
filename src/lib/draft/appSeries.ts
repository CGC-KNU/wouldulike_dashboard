import { unstable_cache } from "next/cache";
import { readGa4AppMetrics, readLastEventDate, type Ga4AppMetrics } from "@/lib/bigquery/appMetrics";
import { readCouponFunnel, readCouponUseFunnel, readStoreToCoupon, type CouponFunnel, type CouponUseFunnel, type StoreToCoupon } from "@/lib/bigquery/couponFunnel";
import type { BackendFetch } from "./appReport";
import type { PeriodStats } from "./appReportData";
import { dashed, kstToday, shiftDays, type RangeSpec } from "./appRange";
import { buildSeries, type AppSeries, type CellInput } from "./appSeriesData";
import { fetchBackendJson } from "./toolProxy";

/**
 * Probe · 앱 지표 **기간 × 단위** 표 가져오기 — 칸마다 주간·월간 보고서와 **같은 함수**를 그 창으로 부른다(민찬 1015).
 *
 * 새 SQL 을 만들지 않은 까닭: 정의가 두 벌이 되면 같은 주를 두 곳에서 다르게 읽는다. 대신 칸 수만큼 부른다.
 * 32칸(3월~ 전체 주)을 같이 쏴서 GA4 9초 · 쿠폰 퍼널 5초(1015 로컬 실측) — 한 칸을 부를 때와 거의 같다.
 * 칸마다 BigQuery 를 열다섯 번쯤 부르므로(쿼리당 최소 과금 10MB) 지난 칸은 캐시한다.
 *
 *  - GA4: 주·일 단위는 끝 날에서 거꾸로 잡는 고정 창(anchored) — 주간 보고서와 같다. 월 단위는 그 달 안(in-period) — 월간 보고서와 같다.
 *  - DB: 백엔드 `app-stats/period`(KST, 끝 날 포함, 92일까지)를 칸마다. 동시에 6개까지만 — Koyeb 한 대가 받는다.
 *  - 「기간 전체」: GA4·쿠폰 퍼널은 기간을 한 번에 다시 센다(고유 기기는 칸의 합이 아니다). DB 건수는 칸의 합이고,
 *    비율(발급 → 사용)만 기간 전체로 한 번 더 부른다(92일 넘으면 백엔드가 거절해 비운다).
 */

const withCookie: BackendFetch = (path, search) => fetchBackendJson(path, search, true);

/** 확정 테이블은 1~3일 뒤까지 고쳐진다 — 그보다 지난 창만 오래 캐시한다 */
const settled = (end: string, through: string | null) => !!through && shiftDays(end, 3) <= through;

const unwrap = <T>(r: { ok: true; data: T } | { ok: false; reason: string; detail?: string }): T => {
  if (!r.ok) throw new Error(r.reason === "no_key" ? "GCP_SA_KEY 미설정" : r.detail ?? "조회 실패");
  return r.data;
};

type Sub = "anchored" | "in-period";
const readGa4 = async (start: string, end: string, sub: Sub) => unwrap(await readGa4AppMetrics(process.env, { start, end, subWindows: sub }));
const readCoupons = async (start: string, end: string) => unwrap(await readCouponFunnel(process.env, { start, end }));
const readS2C = async (start: string, end: string) => unwrap(await readStoreToCoupon(process.env, { start, end }));
// 쓰기 퍼널은 「발급 + 7일」까지 읽는다 — through 가 바뀌면 값이 바뀌므로 캐시 키에 넣는다
const readUse = async (start: string, end: string, through: string) => unwrap(await readCouponUseFunnel(process.env, { start, end, through }));

// 성공만 캐시된다 — 실패는 throw 로 빠져나가 캐시에 남지 않는다(/api/probe/app 과 같은 방식)
const LONG = 7 * 24 * 3600;
const SHORT = 3 * 3600;
const cache = {
  ga4: { long: unstable_cache(readGa4, ["app-series-ga4-v1"], { revalidate: LONG }), short: unstable_cache(readGa4, ["app-series-ga4-v1s"], { revalidate: SHORT }) },
  coupons: { long: unstable_cache(readCoupons, ["app-series-coupons-v1"], { revalidate: LONG }), short: unstable_cache(readCoupons, ["app-series-coupons-v1s"], { revalidate: SHORT }) },
  s2c: { long: unstable_cache(readS2C, ["app-series-s2c-v1"], { revalidate: LONG }), short: unstable_cache(readS2C, ["app-series-s2c-v1s"], { revalidate: SHORT }) },
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

export async function buildAppSeries(spec: RangeSpec, opts: { fetchJson?: BackendFetch } = {}): Promise<AppSeries> {
  const fetchJson = opts.fetchJson ?? withCookie;
  const today = kstToday();
  const through = await readLastEventDate().catch(() => null);
  const sub: Sub = spec.unit === "month" ? "in-period" : "anchored";
  // 기간 전체 — 한 달 이상이면 월간 보고서처럼 그 안에서, 짧으면 주간 보고서처럼 끝에서 거꾸로
  const totalSub: Sub = spec.days >= 28 ? "in-period" : "anchored";

  const fails = new Map<string, number>();
  const detail = new Set<string>();

  /** 창 하나의 GA4 묶음(지표 · 쿠폰 퍼널 · 매장 상세 → 쿠폰 · 쓰기 퍼널) */
  const ga4Window = async (start: string, end: string, s: Sub): Promise<Omit<CellInput, "db">> => {
    // 확정 테이블보다 뒤에서 시작하는 칸(오늘 같은) — 읽을 것이 없다. 「못 읽음」이 아니라 「집계 전」
    if (!through || start > through) return { ga4: null, coupons: null, s2c: null, use: null, ga4Pending: !!through };
    const pick = settled(end, through) ? "long" : "short";
    // 쓰기 퍼널은 발급 뒤 7일까지 봐야 굳는다
    const usePick = settled(shiftDays(end, 7), through) ? "long" : "short";
    const capped = end > through ? through : end;
    const [ga4, coupons, s2c, use] = await Promise.all([
      attempt(() => cache.ga4[pick](start, end, s) as Promise<Ga4AppMetrics>, fails, "GA4 지표", detail),
      attempt(() => cache.coupons[pick](start, capped) as Promise<CouponFunnel>, fails, "쿠폰 퍼널", detail),
      attempt(() => cache.s2c[pick](start, capped) as Promise<StoreToCoupon>, fails, "매장 상세 → 쿠폰", detail),
      attempt(() => cache.use[usePick](start, capped, through) as Promise<CouponUseFunnel>, fails, "쓰기 퍼널", detail),
    ]);
    return { ga4, coupons, s2c, use };
  };

  const dbWindow = (start: string, end: string) =>
    fetchJson<PeriodStats>("/api/dashboard/admin/app-stats/period/", `start=${dashed(start)}&end=${dashed(end)}`);

  const [ga4Cells, totalGa4, dbFirst, totalDb] = await Promise.all([
    pool(spec.buckets, 32, (b) => ga4Window(b.start, b.end, sub)),
    ga4Window(spec.start, spec.end, totalSub),
    pool(spec.buckets, 6, (b) => dbWindow(b.start, b.end)),
    spec.days <= 92 ? dbWindow(spec.start, spec.end) : Promise.resolve(null),
  ]);

  // 백엔드가 잠들어 있으면 첫 요청이 503 이다(Koyeb) — 못 읽은 칸만 한 번 더
  const db = await pool(dbFirst, 6, async (d, i) => d ?? (await dbWindow(spec.buckets[i].start, spec.buckets[i].end)));

  const warnings: string[] = [];
  if (!through) warnings.push("GA4 확정 테이블을 읽지 못했습니다 (GCP_SA_KEY 확인) — GA4 칸이 모두 비었습니다.");
  for (const [what, n] of fails) warnings.push(`${what}을(를) ${n}개 창에서 읽지 못했습니다${detail.size ? ` — ${[...detail][0]}` : ""}`);
  const dbMissed = db.filter((d) => !d?.stats).length;
  if (dbMissed) warnings.push(`백엔드 집계(app-stats/period)를 ${dbMissed}칸 읽지 못했습니다 — DB 칸이 비었습니다.`);

  return buildSeries({
    spec,
    through,
    today,
    cells: ga4Cells.map((g, i) => ({ ...g, db: db[i] ?? null })),
    total: { ...totalGa4, db: totalDb ?? null },
    warnings,
  });
}
