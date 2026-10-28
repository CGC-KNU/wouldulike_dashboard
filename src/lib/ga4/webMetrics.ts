import { GoogleAuth } from "google-auth-library";
import { credentialsFromEnv } from "@/lib/bigquery/appMetrics";

/**
 * Probe · 웹 지표 — 우주라이크 홈(wouldulike.kr)의 GA4 웹 스트림을 Data API 로 읽는다.
 *
 * 웹 스트림(`G-R4EE9LLPKP`)은 앱 스트림과 **같은 속성**(494806625)에 있다. 앱 지표는 BigQuery 로 읽지만 웹은 스트림이 생긴 날(1027)부터
 * 쌓이고 내보내기가 하루 늦어서, 처음부터 Data API 로 읽는다 — 서비스 계정(`GCP_SA_KEY`)을 속성에 뷰어로 넣어 두었다.
 * 속성에 앱 이벤트가 같이 있으므로 모든 요청에 `platform = web` 을 건다. 빠뜨리면 앱 숫자가 웹에 섞인다.
 *
 * 오늘은 아직 끝나지 않아 어제까지만 센다. 못 읽은 값은 null — 0 이 아니라 모름이다.
 * Next 에 의존하지 않는다(캐시는 라우트가 건다).
 */

export const WEB_PROPERTY = "494806625";
const BASE = `https://analyticsdata.googleapis.com/v1beta/properties/${WEB_PROPERTY}:runReport`;
const WEB_ONLY = { filter: { fieldName: "platform", stringFilter: { matchType: "EXACT", value: "web" } } };

export interface WebDay { date: string; users: number; sessions: number }
export interface WebWindow { from: string; to: string; users: number | null; sessions: number | null }
export interface WebChannel { channel: string; sessions: number; users: number }
export interface WebEvent { name: string; count: number; users: number }
export interface WebMetrics {
  /** 최근 7일(어제까지)과 그 앞 7일 */
  week: WebWindow;
  prevWeek: WebWindow;
  /** 최근 28일 일별 */
  days: WebDay[];
  channels: WebChannel[];
  events: WebEvent[];
  generated_at: string;
}
export type WebResult = { ok: true; data: WebMetrics } | { ok: false; reason: "no_key" | "error"; detail?: string };

interface Row { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }
interface Report { rows?: Row[] }

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** KST 의 오늘에서 n 일 전 날짜(YYYY-MM-DD) */
function kstDaysAgo(n: number): string {
  const kst = new Date(Date.now() + 9 * 3_600_000);
  kst.setUTCDate(kst.getUTCDate() - n);
  return iso(kst);
}
const num = (r: Row, i: number) => Number(r.metricValues?.[i]?.value ?? 0);
const dim = (r: Row, i: number) => r.dimensionValues?.[i]?.value ?? "";

export async function readWebMetrics(env: Record<string, string | undefined> = process.env): Promise<WebResult> {
  let credentials: Record<string, string> | null;
  try { credentials = credentialsFromEnv(env); } catch { return { ok: false, reason: "no_key" }; }
  if (!credentials) return { ok: false, reason: "no_key" };
  try {
    const client = await new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/analytics.readonly"] }).getClient();
    const run = async (body: Record<string, unknown>): Promise<Report> =>
      (await client.request<Report>({ url: BASE, method: "POST", data: { dimensionFilter: WEB_ONLY, ...body } })).data;

    const to = kstDaysAgo(1);
    const wFrom = kstDaysAgo(7), pFrom = kstDaysAgo(14), pTo = kstDaysAgo(8), dFrom = kstDaysAgo(28);
    const totals = (a: string, b: string) => ({ dateRanges: [{ startDate: a, endDate: b }], metrics: [{ name: "activeUsers" }, { name: "sessions" }] });

    const [daily, w, p, ch, ev] = await Promise.all([
      run({ dateRanges: [{ startDate: dFrom, endDate: to }], dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "sessions" }], orderBys: [{ dimension: { dimensionName: "date" } }], limit: 40 }),
      run(totals(wFrom, to)),
      run(totals(pFrom, pTo)),
      run({ dateRanges: [{ startDate: dFrom, endDate: to }], dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }, { name: "activeUsers" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 12 }),
      run({ dateRanges: [{ startDate: dFrom, endDate: to }], dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }, { name: "totalUsers" }], orderBys: [{ metric: { metricName: "eventCount" }, desc: true }], limit: 40 }),
    ]);

    // 하루도 안 찍힌 날은 행이 없다 — 0 으로 채워 선이 끊기지 않게 한다(웹 스트림은 방문이 없는 날이 실제로 0 이다)
    const byDate = new Map((daily.rows ?? []).map((r) => [dim(r, 0), r] as const));
    const days: WebDay[] = [];
    for (let n = 28; n >= 1; n--) {
      const d = kstDaysAgo(n);
      const r = byDate.get(d.replace(/-/g, ""));
      days.push({ date: d, users: r ? num(r, 0) : 0, sessions: r ? num(r, 1) : 0 });
    }
    const win = (rep: Report, from: string, end: string): WebWindow => {
      const r = rep.rows?.[0];
      return { from, to: end, users: r ? num(r, 0) : 0, sessions: r ? num(r, 1) : 0 };
    };
    return {
      ok: true,
      data: {
        week: win(w, wFrom, to),
        prevWeek: win(p, pFrom, pTo),
        days,
        channels: (ch.rows ?? []).map((r) => ({ channel: dim(r, 0), sessions: num(r, 0), users: num(r, 1) })),
        events: (ev.rows ?? []).map((r) => ({ name: dim(r, 0), count: num(r, 0), users: num(r, 1) })),
        generated_at: new Date().toISOString(),
      },
    };
  } catch (e) {
    const err = e as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
    return { ok: false, reason: "error", detail: `${err.response?.status ?? ""} ${err.response?.data?.error?.message ?? err.message ?? ""}`.trim().slice(0, 200) };
  }
}
