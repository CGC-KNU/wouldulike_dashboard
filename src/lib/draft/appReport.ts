import { readGa4AppMetrics, readLastEventDate, type Ga4AppMetrics } from "@/lib/bigquery/appMetrics";
import { buildAppReportData, appReportFilename, lastCompleteWeekEnd, shiftDay, weekLabel, type AppStats, type Json } from "./appReportData";
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
 *    DB 칸은 애초에 "이번 달 누계"라 굳혀 둘 시점이 없다.
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
  const [curR, prevR, stats] = await Promise.all([
    readGa4AppMetrics(process.env, { end }),
    readGa4AppMetrics(process.env, { end: shiftDay(end, -7) }),
    fetchBackendJson<AppStats>("/api/dashboard/admin/app-stats/", undefined, true),
  ]);

  const cur: Ga4AppMetrics | null = curR.ok ? curR.data : null;
  const prev: Ga4AppMetrics | null = prevR.ok ? prevR.data : null;
  if (!curR.ok) warnings.push(`GA4 를 읽지 못했습니다 — ${curR.reason === "no_key" ? "GCP_SA_KEY 미설정" : curR.detail ?? "조회 실패"}`);
  else if (!prevR.ok) warnings.push("전주 GA4 를 읽지 못해 전주 대비를 붙이지 못했습니다.");
  if (!stats?.stats) warnings.push("백엔드 app-stats 를 읽지 못했습니다 — DB·푸시 칸이 비었습니다.");

  return {
    data: buildAppReportData({ end, cur, prev, stats: stats ?? null }),
    filename: appReportFilename(end),
    week: { start: shiftDay(end, -6), end, label: weekLabel(end) },
    warnings,
  };
}
