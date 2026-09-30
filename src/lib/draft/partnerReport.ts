import { readLastEventDate } from "@/lib/bigquery/appMetrics";
import { readPartnerExposure, type PartnerExposure } from "@/lib/bigquery/partnerExposure";
import { buildPartnerMonthlyData, type Json } from "./partnerMonthly";
import { previousPeriod } from "./appReportMonthly";
import { monthWindow, lastCompleteMonth, type BackendFetch } from "./appReport";
import { fetchBackendJson } from "./toolProxy";
import type { Bucket, SummaryPayload } from "@/app/api/probe/insights/summary/route";

/**
 * Probe · **제휴 가게 사장님 월간 보고서** 발급 — 가져오기만 한다.
 *
 * 모양 만들기는 `partnerMonthly.ts`, 양식 끼우기는 `partnerTemplate.ts`.
 * `next/headers` 를 쓰는 toolProxy 를 물고 있어 테스트에서 못 부른다 — 그래서 변환을 따로 뒀다.
 *
 * 앱 지표 보고서(`appReport.ts`)와 **읽는 곳이 다르다**:
 *  · 앱 숫자 — BigQuery(`readPartnerExposure`). 세션·비율이 아니라 가게 노출·쿠폰 사용을 센다.
 *  · 인스타 — 백엔드 `/api/probe/insights/summary/`. 화면에서는 쿠키, 크론에서는 X-CRON-TOKEN.
 *
 * 스냅샷을 저장하지 않는다. 부를 때마다 다시 읽는다 — 둘 다 지난 달 값이라 안 변한다.
 */

const withCookie: BackendFetch = (path, search) => fetchBackendJson(path, search, true);

export interface PartnerReportBuild {
  data: Json;
  filename: string;
  period: string;
  /** 사람이 읽을 실패 사유. data 가 있어도 칸이 비었을 수 있다 */
  warnings: string[];
}

/**
 * 한 달치. `period` 를 안 주면 **마지막으로 다 끝난 달**.
 *
 * 못 읽은 칸은 비운 채로 낸다 — 양식이 「이번 달은 세지 못했습니다」로 그린다. 0 으로 채우지 않는다.
 */
export async function buildPartnerMonthlyReport(
  opts: { period?: string; fetchJson?: BackendFetch } = {}
): Promise<PartnerReportBuild> {
  const warnings: string[] = [];
  const fetchJson = opts.fetchJson ?? withCookie;
  const period = opts.period ?? lastCompleteMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error(`period 는 "YYYY-MM" 이어야 합니다 — 받은 값: ${period}`);

  const win = monthWindow(period);
  const prevWin = monthWindow(previousPeriod(period));

  const last = await readLastEventDate();
  // 확정 테이블이 달 끝보다 이르면 며칠이 빠진다. 숨기지 않고 각주로 밝힌다.
  const through = last && win.end > last ? last : null;
  const end = through ?? win.end;
  if (through) {
    warnings.push(`${period} 은 아직 ${through.slice(4, 6)}/${through.slice(6, 8)} 까지만 집계됐습니다 — 앱 숫자가 그 달 전체가 아닙니다.`);
  }

  const [curR, prevR, ig] = await Promise.all([
    readPartnerExposure(process.env, { start: win.start, end }),
    readPartnerExposure(process.env, prevWin),
    // 6개월을 받아 period 로 고른다 — 발행이 없던 달은 버킷 자체가 없어 순서로 집으면 엉뚱한 달을 쓴다
    fetchJson<SummaryPayload>("/api/probe/insights/summary/", "months=6&weeks=1"),
  ]);

  const app: PartnerExposure | null = curR.ok ? curR.data : null;
  const appPrev: PartnerExposure | null = prevR.ok ? prevR.data : null;
  if (!curR.ok) {
    warnings.push(`앱 숫자를 읽지 못했습니다 — ${curR.reason === "no_key" ? "GCP_SA_KEY 미설정" : curR.detail ?? "조회 실패"}`);
  } else if (!prevR.ok) {
    warnings.push("전달 앱 숫자를 읽지 못해 전달 대비를 붙이지 못했습니다.");
  }

  const bucket = (p: string): Bucket | null => ig?.months?.find((m) => m.period === p) ?? null;
  const instagram = bucket(period);
  if (!ig) warnings.push("인스타 성과를 읽지 못했습니다 — 그 칸은 비웁니다(0 이 아닙니다).");
  else if (!instagram) warnings.push(`${period} 에 발행한 게시물이 없어 인스타 칸을 비웁니다.`);

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  return {
    data: buildPartnerMonthlyData({
      period, app, appPrev, instagram, instagramPrev: bucket(previousPeriod(period)), today,
      through: through ? `${through.slice(0, 4)}-${through.slice(4, 6)}-${through.slice(6, 8)}` : null,
    }),
    filename: `우주라이크_사장님보고_${period}`.replace(/[\\/:*?"<>|\s]+/g, "_"),
    period,
    warnings,
  };
}
