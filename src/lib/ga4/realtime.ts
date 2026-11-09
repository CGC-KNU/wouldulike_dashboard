import { GoogleAuth } from "google-auth-library";
import { credentialsFromEnv } from "@/lib/bigquery/appMetrics";
import { WEB_PROPERTY } from "./webMetrics";
import { nowRanges, shapeNow, type Ga4Now, type RtReport } from "./realtimeShape";

/**
 * Probe · 실시간 지표의 「지금」 칸 — GA4 실시간 API(runRealtimeReport)로 최근 30분 앱 사용자를 읽는다.
 *
 * 앱 · 웹이 같은 속성(494806625)이라 모든 요청에서 web 을 뺀다. 서비스 계정은 웹 지표와 같은 뷰어 권한(1108 호출 확인).
 * 실시간 API 는 사용자 id 차원을 주지 않아 테스트 기기를 거를 수 없다 — 화면에 그렇게 적는다.
 * 한 번 읽는 데 요청 6개(5분 칸 둘씩 3개 + 플랫폼 + 이벤트 + 화면). 속성당 동시 10개 아래, 토큰은 라우트 캐시(1분)로 묶는다.
 */

const URL_RT = `https://analyticsdata.googleapis.com/v1beta/properties/${WEB_PROPERTY}:runRealtimeReport`;
const APP_ONLY = { notExpression: { filter: { fieldName: "platform", stringFilter: { matchType: "EXACT", value: "web" } } } };

export type NowResult = { ok: true; data: Ga4Now } | { ok: false; reason: "no_key" | "error"; detail?: string };

export async function readGa4Now(env: Record<string, string | undefined> = process.env): Promise<NowResult> {
  let credentials: Record<string, string> | null;
  try { credentials = credentialsFromEnv(env); } catch { return { ok: false, reason: "no_key" }; }
  if (!credentials) return { ok: false, reason: "no_key" };
  try {
    const client = await new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/analytics.readonly"] }).getClient();
    const run = async (body: Record<string, unknown>): Promise<RtReport> =>
      (await client.request<RtReport>({ url: URL_RT, method: "POST", data: { dimensionFilter: APP_ONLY, ...body } })).data;

    const ranges = nowRanges();
    // minuteRanges 는 요청당 둘까지 — 둘씩 묶어 3번. 차원을 안 주면 칸 이름이 `dateRange` 차원으로 온다
    const pairs = [0, 2, 4].map((i) => ranges.slice(i, i + 2));
    const [b01, b23, b45, platform, events, screens] = await Promise.all([
      ...pairs.map((minuteRanges) => run({ metrics: [{ name: "activeUsers" }], minuteRanges })),
      run({ dimensions: [{ name: "platform" }], metrics: [{ name: "activeUsers" }] }),
      // 이벤트 × 분 — 30분 × 이벤트 종류라 넉넉히
      run({ dimensions: [{ name: "minutesAgo" }, { name: "eventName" }], metrics: [{ name: "eventCount" }], limit: 1000 }),
      run({ dimensions: [{ name: "unifiedScreenName" }], metrics: [{ name: "activeUsers" }], limit: 20 }),
    ]);
    return { ok: true, data: shapeNow({ bucketUsers: [b01, b23, b45], platform, events, screens }, new Date().toISOString()) };
  } catch (e) {
    const err = e as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
    return { ok: false, reason: "error", detail: `${err.response?.status ?? ""} ${err.response?.data?.error?.message ?? err.message ?? ""}`.trim() };
  }
}
