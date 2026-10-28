import { GoogleAuth } from "google-auth-library";
import { credentialsFromEnv } from "@/lib/bigquery/appMetrics";
import {
  buildFunnel, ctaTypeSplit, fillDays, leadSplit, locationSplit, mergePages, planSplit, sectionSplit, stepSplit, storeClicks,
  type Splits, type StoreClicks, type WebFunnel, type WebPage,
} from "./webShape";

/**
 * Probe · 웹 지표 — 우주라이크 홈(wouldulike.kr)의 GA4 웹 스트림을 Data API 로 읽는다.
 *
 * 웹 스트림(`G-R4EE9LLPKP`)은 앱 스트림과 **같은 속성**(494806625)에 있다. 앱 지표는 BigQuery 로 읽지만 웹은 스트림이 생긴 날(1027)부터
 * 쌓이고 내보내기 대상에도 빠져 있어서 Data API 로 읽는다 — 서비스 계정(`GCP_SA_KEY`)을 속성에 뷰어로 넣어 두었다.
 * 속성에 앱 이벤트가 같이 있으므로 모든 요청에 `platform = web` 을 건다. 빠뜨리면 앱 숫자가 웹에 섞인다.
 *
 * 1028 A: 머리 숫자는 한국(countryId=KR)만 센다 — 해외는 참여 0 인 봇으로 보여 따로 센다(webShape.ts).
 * 신청 완료는 `/join` 의 `sign_up`(제출 성공 뒤), 앱 설치 버튼은 향상된 측정 `click` 의 link_domain 으로 센다.
 *
 * 오늘은 아직 끝나지 않아 어제까지만 센다. 못 읽은 값은 null — 0 이 아니라 모름이다.
 * Next 에 의존하지 않는다(캐시는 라우트가 건다).
 */

export const WEB_PROPERTY = "494806625";
const BASE = `https://analyticsdata.googleapis.com/v1beta/properties/${WEB_PROPERTY}:runReport`;
const BATCH = `https://analyticsdata.googleapis.com/v1beta/properties/${WEB_PROPERTY}:batchRunReports`;

type Expr = Record<string, unknown>;
const eq = (fieldName: string, value: string): Expr => ({ filter: { fieldName, stringFilter: { matchType: "EXACT", value } } });
const and = (...expressions: Expr[]): Expr => ({ andGroup: { expressions } });
const WEB = eq("platform", "web");
const KR = eq("countryId", "KR");
const WEB_KR = and(WEB, KR);
const WEB_ABROAD = and(WEB, { notExpression: KR });

export interface WebDay { date: string; users: number; sessions: number }
export interface WebWindow { from: string; to: string; users: number; sessions: number; engaged: number }
export interface WebChannel { channel: string; sessions: number; users: number }
export interface WebEvent { name: string; count: number; users: number }
export interface WebMetrics {
  /** 최근 7일(어제까지)과 그 앞 7일 — 한국만 */
  week: WebWindow;
  prevWeek: WebWindow;
  /** 뺀 해외 방문자(봇 추정) — 최근 7일 · 28일 */
  abroad: { week: number; d28: number };
  /** 최근 28일 일별 — 한국만 */
  days: WebDay[];
  channels: WebChannel[];
  events: WebEvent[];
  pages: WebPage[];
  funnel: WebFunnel;
  stores: StoreClicks;
  /** 맞춤 측정기준(1028 등록)으로 나눈 것 — 최근 28일 · 한국. 등록 전 이벤트는 각 `unset` 에 */
  cta: Splits;
  /** 입점 신청 버튼만, 위치별 */
  ctaLocation: Splits;
  sections: Splits;
  steps: Splits;
  leads: Splits;
  plans: Splits;
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
      (await client.request<Report>({ url: BASE, method: "POST", data: { dimensionFilter: WEB_KR, ...body } })).data;

    const to = kstDaysAgo(1);
    const wFrom = kstDaysAgo(7), pFrom = kstDaysAgo(14), pTo = kstDaysAgo(8), dFrom = kstDaysAgo(28);
    const d28 = [{ startDate: dFrom, endDate: to }];
    const totals = (a: string, b: string) => ({ dateRanges: [{ startDate: a, endDate: b }], metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "engagedSessions" }] });

    // 맞춤 측정기준 다섯 — batchRunReports 한 번(한 번에 5개까지)
    const byParam = (event: string | string[], dims: string[], extra?: Expr) => ({
      dimensionFilter: and(WEB_KR, typeof event === "string" ? eq("eventName", event) : { filter: { fieldName: "eventName", inListFilter: { values: event } } }, ...(extra ? [extra] : [])),
      dateRanges: d28, dimensions: dims.map((name) => ({ name })), metrics: [{ name: "eventCount" }, { name: "totalUsers" }], limit: 50,
    });
    const batch = async (requests: Record<string, unknown>[]): Promise<Report[]> =>
      (await client.request<{ reports?: Report[] }>({ url: BATCH, method: "POST", data: { requests } })).data.reports ?? [];

    // Data API 는 속성당 동시 요청 10개까지 — 아래 8개 + 묶음 1개
    const [daily, w, p, abroad, ch, ev, pg, clk, params] = await Promise.all([
      run({ dateRanges: d28, dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "sessions" }], limit: 40 }),
      run(totals(wFrom, to)),
      run(totals(pFrom, pTo)),
      run({ dimensionFilter: WEB_ABROAD, dateRanges: [{ startDate: wFrom, endDate: to, name: "week" }, { startDate: dFrom, endDate: to, name: "d28" }], metrics: [{ name: "activeUsers" }] }),
      run({ dateRanges: d28, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }, { name: "activeUsers" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 12 }),
      run({ dateRanges: d28, dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }, { name: "totalUsers" }], orderBys: [{ metric: { metricName: "eventCount" }, desc: true }], limit: 40 }),
      run({ dateRanges: d28, dimensions: [{ name: "hostName" }, { name: "pagePath" }], metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }], limit: 50 }),
      run({ dimensionFilter: and(WEB_KR, eq("eventName", "click")), dateRanges: d28, dimensions: [{ name: "linkDomain" }, { name: "hostName" }, { name: "pagePath" }], metrics: [{ name: "eventCount" }], limit: 50 }),
      batch([
        byParam("cta_click", ["customEvent:cta_type"]),
        byParam("cta_click", ["customEvent:cta_location"], eq("customEvent:cta_type", "signup")),
        byParam("section_view", ["customEvent:section_id"]),
        byParam("signup_step_complete", ["customEvent:step_name"]),
        // 상담 · 견적은 lead_source 만, 신청 완료는 plan 만 갖는다 — 한 표로 읽고 이벤트 이름으로 가른다
        byParam(["generate_lead", "sign_up"], ["eventName", "customEvent:lead_source", "customEvent:plan"]),
      ]),
    ]);
    const [ctaRep, locRep, secRep, stepRep, lpRep] = params;
    const vals = (rep: Report | undefined, i = 0) => (rep?.rows ?? []).map((r) => ({ value: dim(r, i), count: num(r, 0), users: num(r, 1) }));
    const lpRows = (event: string, i: number) => (lpRep?.rows ?? []).filter((r) => dim(r, 0) === event).map((r) => ({ value: dim(r, i), count: num(r, 0), users: num(r, 1) }));
    const cta = ctaTypeSplit(vals(ctaRep));

    const win = (rep: Report, from: string, end: string): WebWindow => {
      const r = rep.rows?.[0];
      return { from, to: end, users: r ? num(r, 0) : 0, sessions: r ? num(r, 1) : 0, engaged: r ? num(r, 2) : 0 };
    };
    // 날짜 범위가 둘이면 응답 첫 측정기준이 범위 이름(week · d28)이다
    const abroadOf = (name: string) => { const r = abroad.rows?.find((x) => dim(x, 0) === name); return r ? num(r, 0) : 0; };
    const events = (ev.rows ?? []).map((r) => ({ name: dim(r, 0), count: num(r, 0), users: num(r, 1) }));
    const pages = mergePages((pg.rows ?? []).map((r) => ({ host: dim(r, 0), path: dim(r, 1), users: num(r, 0), views: num(r, 1) })));
    const dates = Array.from({ length: 28 }, (_, i) => kstDaysAgo(28 - i));
    return {
      ok: true,
      data: {
        week: win(w, wFrom, to),
        prevWeek: win(p, pFrom, pTo),
        abroad: { week: abroadOf("week"), d28: abroadOf("d28") },
        days: fillDays(dates, (daily.rows ?? []).map((r) => ({ date: dim(r, 0), users: num(r, 0), sessions: num(r, 1) }))),
        channels: (ch.rows ?? []).map((r) => ({ channel: dim(r, 0), sessions: num(r, 0), users: num(r, 1) })),
        events,
        pages,
        funnel: { ...buildFunnel(pages, events), click: cta.rows.find((s) => s.value === "signup")?.users ?? 0 },
        stores: storeClicks((clk.rows ?? []).map((r) => ({ linkDomain: dim(r, 0), host: dim(r, 1), path: dim(r, 2), count: num(r, 0) }))),
        cta,
        ctaLocation: locationSplit(vals(locRep)),
        sections: sectionSplit(vals(secRep)),
        steps: stepSplit(vals(stepRep)),
        leads: leadSplit(lpRows("generate_lead", 1)),
        plans: planSplit(lpRows("sign_up", 2)),
        generated_at: new Date().toISOString(),
      },
    };
  } catch (e) {
    const err = e as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
    return { ok: false, reason: "error", detail: `${err.response?.status ?? ""} ${err.response?.data?.error?.message ?? err.message ?? ""}`.trim().slice(0, 200) };
  }
}
