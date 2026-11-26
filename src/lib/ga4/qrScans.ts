import { GoogleAuth } from "google-auth-library";
import { clientFromEnv, credentialsFromEnv } from "@/lib/bigquery/appMetrics";
import { WEB_PROPERTY, WEB_STAMP_STREAM } from "./webMetrics";
import { gaWindow, summarizeAppScans, summarizeWebScans, type AppScanRow, type AppScans, type WebEventRow, type WebScans } from "./qrScansShape";

/**
 * Probe · 매장 QR 의 GA4 칸 — DB 에 안 남는 것 셋: 하루 한도에 걸린 스캔 · 로그인 전에 끝난 스캔(401) · 웹 화면만 연 손님 (1126 민찬).
 *
 * 앱: BigQuery 확정 테이블의 `qr_visit_credit`(QR 로 식당 화면이 열릴 때마다 한 번, result 에 서버 응답).
 *   공유 링크(link_source=share)는 뺀다. 테스트 계정(user_id 58)이 한 번이라도 쓴 기기는 그 기간 통째로 뺀다 —
 *   로그인 전(401) 행에는 user_id 가 없어서 기기로 거른다.
 * 웹: 웹 스탬프 스트림은 BigQuery 내보내기에 없어 Data API 로 읽는다. 확인용 방문(src=qa_test, 1125)은 주소로 거른다.
 * 둘 다 어제(한국)까지 — 앱은 확정 테이블만 쓰는 규칙(appMetrics.ts)이고, 웹도 같은 창으로 맞춘다.
 * 한쪽이 실패해도 다른 쪽은 낸다. 못 읽은 쪽은 null — 0 이 아니라 모름이다.
 */

export interface QrScans {
  window: { start: string; end: string } | null;
  app: AppScans | null;
  web: WebScans | null;
  errors: { app?: string; web?: string };
}

const TEST_USER_ID = "58";
const compact = (iso: string) => iso.replaceAll("-", "");
const kstYesterday = () => new Date(Date.now() + 9 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
const errText = (e: unknown) => (e instanceof Error ? e.message.slice(0, 160) : "알 수 없는 오류");

async function readApp(env: Record<string, string | undefined>, start: string, end: string): Promise<AppScans> {
  const client = clientFromEnv(env);
  if (!client) throw new Error("GCP_SA_KEY 없음");
  const { dataset, run } = client;
  const ANY = (k: string) => `(SELECT COALESCE(CAST(value.int_value AS STRING), value.string_value) FROM UNNEST(event_params) WHERE key='${k}')`;
  const S = (k: string) => `(SELECT value.string_value FROM UNNEST(event_params) WHERE key='${k}')`;
  const base = `
    WITH tester AS (
      SELECT DISTINCT user_pseudo_id FROM \`${dataset}.events_*\`
      WHERE _TABLE_SUFFIX BETWEEN @start AND @end AND user_id = '${TEST_USER_ID}'
    ), ev AS (
      SELECT user_pseudo_id AS device, ${ANY("restaurant_id")} AS rid, ${S("result")} AS result
      FROM \`${dataset}.events_*\`
      WHERE _TABLE_SUFFIX BETWEEN @start AND @end
        AND event_name = 'qr_visit_credit'
        AND IFNULL(${S("link_source")}, 'none') != 'share'
        AND user_pseudo_id NOT IN (SELECT user_pseudo_id FROM tester)
    )`;
  const params = { start: compact(start), end: compact(end) };
  const [rows, [dev]] = await Promise.all([
    run<AppScanRow>(`${base} SELECT rid, result, COUNT(*) AS n FROM ev GROUP BY rid, result`, params),
    run<{ devices: number }>(`${base} SELECT COUNT(DISTINCT device) AS devices FROM ev`, params),
  ]);
  return summarizeAppScans(rows, Number(dev?.devices ?? 0));
}

interface Row { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }

async function readWeb(env: Record<string, string | undefined>, start: string, end: string): Promise<WebScans> {
  const credentials = credentialsFromEnv(env);
  if (!credentials) throw new Error("GCP_SA_KEY 없음");
  const client = await new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/analytics.readonly"] }).getClient();
  const eq = (fieldName: string, value: string) => ({ filter: { fieldName, stringFilter: { matchType: "EXACT", value } } });
  const filter = {
    andGroup: {
      expressions: [
        eq("streamId", WEB_STAMP_STREAM),
        { notExpression: { filter: { fieldName: "pageLocation", stringFilter: { matchType: "CONTAINS", value: "src=qa_test" } } } },
      ],
    },
  };
  const dateRanges = [{ startDate: start, endDate: end }];
  const { data } = await client.request<{ reports?: { rows?: Row[] }[] }>({
    url: `https://analyticsdata.googleapis.com/v1beta/properties/${WEB_PROPERTY}:batchRunReports`,
    method: "POST",
    data: {
      requests: [
        { dimensionFilter: filter, dateRanges, dimensions: [{ name: "eventName" }, { name: "pagePath" }], metrics: [{ name: "eventCount" }], limit: 2000 },
        { dimensionFilter: { andGroup: { expressions: [filter, eq("eventName", "web_stamp_view")] } }, dateRanges, metrics: [{ name: "totalUsers" }] },
      ],
    },
  });
  const [events, viewers] = data.reports ?? [];
  const rows: WebEventRow[] = (events?.rows ?? []).map((r) => ({
    event: r.dimensionValues?.[0]?.value ?? "",
    path: r.dimensionValues?.[1]?.value ?? "",
    n: Number(r.metricValues?.[0]?.value ?? 0),
  }));
  return summarizeWebScans(rows, Number(viewers?.rows?.[0]?.metricValues?.[0]?.value ?? 0));
}

export async function readQrScans(
  env: Record<string, string | undefined> = process.env,
  opts: { start: string; end: string },
): Promise<QrScans> {
  const window = gaWindow(opts.start, opts.end, kstYesterday());
  if (!window) return { window: null, app: null, web: null, errors: {} };
  const [app, web] = await Promise.allSettled([readApp(env, window.start, window.end), readWeb(env, window.start, window.end)]);
  return {
    window,
    app: app.status === "fulfilled" ? app.value : null,
    web: web.status === "fulfilled" ? web.value : null,
    errors: {
      ...(app.status === "rejected" ? { app: errText(app.reason) } : {}),
      ...(web.status === "rejected" ? { web: errText(web.reason) } : {}),
    },
  };
}
