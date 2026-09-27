import { readGa4AppMetrics, readLastEventDate, type Ga4AppMetrics } from "@/lib/bigquery/appMetrics";
import { readCouponFunnel, readStoreToCoupon, type CouponFunnel, type StoreToCoupon } from "@/lib/bigquery/couponFunnel";
import { buildAppReportData, appReportFilename, dash, lastCompleteWeekEnd, shiftDay, weekLabel, type AppStats, type Json, type PeriodStats } from "./appReportData";
import { buildMonthlyAppReportData, previousPeriod, type SnapshotPayload } from "./appReportMonthly";
import { fetchBackendJson } from "./toolProxy";

/**
 * Probe · 앱 지표 **주간 보고서** 발급 — 화면에서 누르면 파일 한 장이 나온다.
 *
 * 여기는 **가져오기**만 한다(모양 만들기는 appReportData.ts, 양식 끼우기는 fillAppReportTemplate).
 * `next/headers` 를 쓰는 toolProxy 를 물고 있어 테스트에서 못 부른다 — 그래서 변환을 따로 뒀다.
 *
 * 매장 리포트(reportTemplate.ts)와 다른 점:
 *  - 내부 보고라 점주 링크·토큰·열람 비콘·금지 표현 검사가 없다. 로그인한 담당자만 본다.
 *  - 스냅샷을 저장하지 않는다. 부를 때마다 다시 읽는다 — GA4 칸은 확정 테이블이라 값이 안 변하고,
 *    DB 칸은 부를 때마다 백엔드(app-stats/period)가 그 주를 다시 센다.
 *    (월간 「전월 대비」는 백엔드에 월별 스냅샷 표가 생겨야 한다 — 그게 없으면 지난달을 되살릴 수 없다.)
 */

export interface AppReportBuild {
  data: Json;
  filename: string;
  week: { start: string; end: string; label: string };
  /** 사람이 읽을 실패 사유. data 가 있어도 칸이 비었을 수 있다 */
  warnings: string[];
}

/**
 * 주간 보고서 한 벌. `end` 를 주면 그 주(YYYYMMDD, 그 주 일요일), 안 주면 마지막으로 다 끝난 주.
 * GA4 를 못 읽으면 그 칸들은 비운 채로 낸다 — 양식이 "연결 전"으로 그린다. 0 으로 채우지 않는다.
 */
export async function buildWeeklyAppReport(opts: { end?: string } = {}): Promise<AppReportBuild> {
  const warnings: string[] = [];

  const last = await readLastEventDate();
  const end = opts.end ?? (last ? lastCompleteWeekEnd(last) : null);
  if (!end) throw new Error("GA4 확정 테이블을 읽지 못해 어느 주를 뽑을지 정할 수 없습니다 (GCP_SA_KEY 확인).");
  if (last && end > last) warnings.push(`${end} 까지의 확정 테이블이 아직 없습니다 (${last} 까지). 그 주는 일부만 셉니다.`);

  // 지난주·그 전주를 같은 함수로 뽑는다 — 정의가 갈라지면 전주 대비가 뜻이 없다.
  const start = shiftDay(end, -6);
  const prevEnd = shiftDay(end, -7);
  const weekOf = (from: string, to: string) =>
    fetchBackendJson<PeriodStats>("/api/dashboard/admin/app-stats/period/", `start=${dash(from)}&end=${dash(to)}`, true);
  const [curR, prevR, stats, week, weekPrev, cpR, cpPrevR, s2cR] = await Promise.all([
    readGa4AppMetrics(process.env, { end }),
    readGa4AppMetrics(process.env, { end: prevEnd }),
    // 「7일 안에 만료」·「발급 → 사용」은 여기(이번 달 기준)에서만 온다
    fetchBackendJson<AppStats>("/api/dashboard/admin/app-stats/", undefined, true),
    // 나머지 DB 칸은 그 주 · 전주만 센다 — GA4 칸과 같은 창
    weekOf(start, end),
    weekOf(shiftDay(prevEnd, -6), prevEnd),
    // 쿠폰 발급→사용은 GA4 라 주간에서도 기간이 정확하다 — DB 칸처럼 월 누계로 새지 않는다
    readCouponFunnel(process.env, { start, end }),
    readCouponFunnel(process.env, { start: shiftDay(prevEnd, -6), end: prevEnd }),
    // Probe 화면(/api/probe/app)이 쓰는 것과 같은 함수 — 같은 주를 두 곳에서 다르게 읽지 않게 한다
    readStoreToCoupon(process.env, { start, end }),
  ]);
  const coupons: CouponFunnel | null = cpR.ok ? cpR.data : null;
  const couponsPrev: CouponFunnel | null = cpPrevR.ok ? cpPrevR.data : null;
  if (!cpR.ok && cpR.reason !== "no_key") warnings.push(`쿠폰 퍼널을 읽지 못했습니다 — ${cpR.detail ?? "조회 실패"}`);
  const storeToCoupon: StoreToCoupon | null = s2cR.ok ? s2cR.data : null;
  if (!s2cR.ok && s2cR.reason !== "no_key") warnings.push(`매장 상세 → 쿠폰 발급을 읽지 못했습니다 — ${s2cR.detail ?? "조회 실패"}`);

  const cur: Ga4AppMetrics | null = curR.ok ? curR.data : null;
  const prev: Ga4AppMetrics | null = prevR.ok ? prevR.data : null;
  if (!curR.ok) warnings.push(`GA4 를 읽지 못했습니다 — ${curR.reason === "no_key" ? "GCP_SA_KEY 미설정" : curR.detail ?? "조회 실패"}`);
  else if (!prevR.ok) warnings.push("전주 GA4 를 읽지 못해 전주 대비를 붙이지 못했습니다.");
  if (!week?.stats) {
    warnings.push(stats?.stats
      ? "주간 DB 칸(app-stats/period)을 읽지 못해 이번 달 누계로 냈습니다."
      : "백엔드 app-stats 를 읽지 못했습니다 — DB·푸시 칸이 비었습니다.");
  } else if (!stats?.stats) {
    warnings.push("백엔드 app-stats 를 읽지 못했습니다 — 「7일 안에 만료」·「발급 → 사용」이 비었습니다.");
  }

  return {
    data: buildAppReportData({ end, cur, prev, stats: stats ?? null, week: week ?? null, weekPrev: weekPrev ?? null, coupons, couponsPrev, storeToCoupon }),
    filename: appReportFilename(end),
    week: { start: shiftDay(end, -6), end, label: weekLabel(end) },
    warnings,
  };
}

// ── 월간 ────────────────────────────────────────────────────────────
/** "2026-09" → { start: "20260901", end: "20260930" } */
function monthWindow(period: string): { start: string; end: string } {
  const y = +period.slice(0, 4);
  const m = +period.slice(5, 7);
  const last = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 0)).getUTCDate();
  return { start: `${period.replace("-", "")}01`, end: `${period.replace("-", "")}${String(last).padStart(2, "0")}` };
}

/** 마지막으로 **다 끝난 달**(KST). 9/22 면 "2026-08". */
export function lastCompleteMonth(nowMs: number = Date.now()): string {
  const kst = new Date(nowMs + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth(); // 0-based → 이게 곧 "지난 달"의 1-based 값
  return m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * 월간 보고서 한 벌. `period` 를 안 주면 마지막으로 다 끝난 달.
 *
 * GA4 는 그 달과 전월을 **같은 정의로**(`subWindows: "in-period"`) 뽑는다.
 * DB 칸은 백엔드 월별 스냅샷에서 온다 — 없으면 비운 채로 낸다(0 으로 채우지 않는다).
 */
export async function buildMonthlyAppReport(opts: { period?: string } = {}): Promise<AppReportBuild> {
  const warnings: string[] = [];
  const period = opts.period ?? lastCompleteMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error(`period 는 "YYYY-MM" 이어야 합니다 — 받은 값: ${period}`);

  const win = monthWindow(period);
  const prevWin = monthWindow(previousPeriod(period));

  const last = await readLastEventDate();
  if (last && win.end > last) {
    warnings.push(`${period} 은 아직 ${last.slice(4, 6)}/${last.slice(6, 8)} 까지만 확정 테이블이 있습니다 — GA4 칸이 그 달 전체가 아닙니다.`);
  }

  const [curR, prevR, snapshot, cpR, cpPrevR, s2cR] = await Promise.all([
    readGa4AppMetrics(process.env, { ...win, subWindows: "in-period" }),
    readGa4AppMetrics(process.env, { ...prevWin, subWindows: "in-period" }),
    fetchBackendJson<SnapshotPayload>("/api/dashboard/admin/metric-snapshots/", `period=${period}`, true),
    readCouponFunnel(process.env, win),
    readCouponFunnel(process.env, prevWin),
    readStoreToCoupon(process.env, win),
  ]);
  const coupons: CouponFunnel | null = cpR.ok ? cpR.data : null;
  const couponsPrev: CouponFunnel | null = cpPrevR.ok ? cpPrevR.data : null;
  if (!cpR.ok && cpR.reason !== "no_key") warnings.push(`쿠폰 퍼널을 읽지 못했습니다 — ${cpR.detail ?? "조회 실패"}`);
  if (coupons?.coverage.wallet_to_use === "none") warnings.push("「쿠폰함 → 사용 화면」은 그 달에 앱 이벤트가 없어 비웠습니다.");
  const storeToCoupon: StoreToCoupon | null = s2cR.ok ? s2cR.data : null;
  if (!s2cR.ok && s2cR.reason !== "no_key") warnings.push(`매장 상세 → 쿠폰 발급을 읽지 못했습니다 — ${s2cR.detail ?? "조회 실패"}`);

  const cur = curR.ok ? curR.data : null;
  const prev = prevR.ok ? prevR.data : null;
  if (!curR.ok) warnings.push(`GA4 를 읽지 못했습니다 — ${curR.reason === "no_key" ? "GCP_SA_KEY 미설정" : curR.detail ?? "조회 실패"}`);
  else if (!prevR.ok) warnings.push("전월 GA4 를 읽지 못해 전월 대비를 붙이지 못했습니다.");
  if (!snapshot?.current) warnings.push(`${period} 월별 스냅샷이 없습니다 — DB 칸이 비었습니다. snapshot_metrics 를 돌리십시오.`);
  else if (!snapshot.previous) warnings.push("전월 스냅샷이 없어 DB 칸의 전월 대비가 없습니다.");
  else if (!snapshot.current.complete) warnings.push(`${period} 은 아직 끝나지 않은 달입니다 — DB 칸은 누계입니다.`);

  return {
    data: buildMonthlyAppReportData({ period, cur, prev, snapshot: snapshot ?? null, coupons, couponsPrev, storeToCoupon }),
    filename: `앱지표_월간보고서_${period}`.replace(/[\\/:*?"<>|\s]+/g, "_"),
    week: { start: win.start, end: win.end, label: `${+period.slice(0, 4)}년 ${+period.slice(5, 7)}월` },
    warnings,
  };
}
