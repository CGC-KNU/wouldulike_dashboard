import { GoogleAuth } from "google-auth-library";
import { credentialsFromEnv } from "@/lib/bigquery/appMetrics";
import { hiddenQueries, kstDaysAgo } from "@/lib/ga4/webShape";

/**
 * Probe · 웹 지표 — 구글 검색(Search Console). 1028 B3.
 *
 * 도메인 속성 `sc-domain:wouldulike.kr` 에 서비스 계정(`GCP_SA_KEY`)을 「제한됨」으로 넣고, GCP 프로젝트에서 Search Console API 를 켰다.
 * 노출 · 클릭 · 순위는 2~3일 늦게 들어온다(`dataState: all` 로 잠정치까지 받는다). 네이버 서치어드바이저는 조회 API 가 없어 못 붙인다.
 * 색인 상태는 URL 검사 API 로 공개 페이지 몇 개만 본다(하루 2,000회 한도 — 라우트가 6시간 캐시).
 * Next 에 의존하지 않는다(캐시는 라우트가 건다).
 */

export const GSC_SITE = "sc-domain:wouldulike.kr";
const BASE = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}`;
const INSPECT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
/** 색인 상태를 보는 공개 페이지 — 사장님 홈 · 학생 소개 */
export const INDEX_PAGES: [string, string][] = [["https://wouldulike.kr/", "사장님 홈"], ["https://wouldulike.kr/students/", "학생 소개"]];

export interface SearchRow { key: string; clicks: number; impressions: number; position: number }
export interface SearchConsoleData {
  from: string;
  to: string;
  totals: { clicks: number; impressions: number; ctr: number | null; position: number | null };
  days: { date: string; clicks: number; impressions: number }[];
  /** 노출 많은 검색어 10개 */
  queries: SearchRow[];
  /** 검색량이 적어 구글이 가린 몫 */
  hidden: { clicks: number; impressions: number };
  pages: SearchRow[];
  index: { url: string; label: string; indexed: boolean; state: string; lastCrawl: string | null }[];
  sitemap: { path: string; submitted: number; lastRead: string | null; errors: number } | null;
  generated_at: string;
}
export type SearchResult = { ok: true; data: SearchConsoleData } | { ok: false; reason: "no_key" | "error"; detail?: string };

interface Row { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }

export async function readSearchConsole(env: Record<string, string | undefined> = process.env): Promise<SearchResult> {
  let credentials: Record<string, string> | null;
  try { credentials = credentialsFromEnv(env); } catch { return { ok: false, reason: "no_key" }; }
  if (!credentials) return { ok: false, reason: "no_key" };
  try {
    const client = await new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] }).getClient();
    const from = kstDaysAgo(28), to = kstDaysAgo(1);
    const query = async (dimensions: string[], rowLimit = 1000): Promise<Row[]> =>
      (await client.request<{ rows?: Row[] }>({ url: `${BASE}/searchAnalytics/query`, method: "POST", data: { startDate: from, endDate: to, dimensions, rowLimit, dataState: "all" } })).data.rows ?? [];
    const inspect = async ([url, label]: [string, string]) => {
      try {
        const r = (await client.request<{ inspectionResult?: { indexStatusResult?: { verdict?: string; coverageState?: string; lastCrawlTime?: string } } }>({
          url: INSPECT, method: "POST", data: { inspectionUrl: url, siteUrl: GSC_SITE, languageCode: "ko" },
        })).data.inspectionResult?.indexStatusResult ?? {};
        return { url, label, indexed: r.verdict === "PASS", state: r.coverageState ?? "확인 못 함", lastCrawl: r.lastCrawlTime ?? null };
      } catch {
        return { url, label, indexed: false, state: "확인 못 함", lastCrawl: null };
      }
    };

    const [total, daily, queries, pages, sitemaps, ...index] = await Promise.all([
      query([], 1), query(["date"]), query(["query"]), query(["page"], 20),
      client.request<{ sitemap?: { path: string; lastDownloaded?: string; errors?: string; contents?: { submitted?: string }[] }[] }>({ url: `${BASE}/sitemaps` }).then((r) => r.data.sitemap ?? []),
      ...INDEX_PAGES.map(inspect),
    ]);
    const t = total[0];
    const totals = { clicks: t?.clicks ?? 0, impressions: t?.impressions ?? 0, ctr: t && t.impressions ? t.ctr : null, position: t && t.impressions ? t.position : null };
    const by = new Map(daily.map((r) => [r.keys?.[0] ?? "", r] as const));
    const days = Array.from({ length: 28 }, (_, i) => kstDaysAgo(28 - i)).map((d) => ({ date: d, clicks: by.get(d)?.clicks ?? 0, impressions: by.get(d)?.impressions ?? 0 }));
    const row = (r: Row): SearchRow => ({ key: r.keys?.[0] ?? "", clicks: r.clicks, impressions: r.impressions, position: r.position });
    const sm = sitemaps[0];
    return {
      ok: true,
      data: {
        from, to, totals, days,
        queries: queries.sort((a, b) => b.impressions - a.impressions).slice(0, 10).map(row),
        hidden: hiddenQueries(totals, queries),
        pages: pages.map(row),
        index,
        sitemap: sm ? { path: sm.path, submitted: (sm.contents ?? []).reduce((a, c) => a + Number(c.submitted ?? 0), 0), lastRead: sm.lastDownloaded ?? null, errors: Number(sm.errors ?? 0) } : null,
        generated_at: new Date().toISOString(),
      },
    };
  } catch (e) {
    const err = e as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
    return { ok: false, reason: "error", detail: `${err.response?.status ?? ""} ${err.response?.data?.error?.message ?? err.message ?? ""}`.trim().slice(0, 200) };
  }
}
