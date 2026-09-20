import { BigQuery } from "@google-cloud/bigquery";

/**
 * Probe · 앱 지표 — GA4 원본(BigQuery export)에서 읽는 4칸.
 *
 * 앱은 3월부터 GA4 로 이벤트를 보내고 `wouldulike-efe19.analytics_494806625` 에 쌓인다(Event/P0 계측 보고).
 * 여기서 WAU · DAU/WAU · 앱 열기 → 매장 상세 · 가입 1주 후 복귀를 계산한다.
 *
 * 규칙 (Event/데이터 파이프라인 문서):
 *  - 확정 테이블 `events_YYYYMMDD` 만 읽는다. `events_intraday_*` 는 늦게 온 이벤트가 붙고 결국 지워져 값이 바뀐다.
 *  - 모든 쿼리에 `_TABLE_SUFFIX` 범위를 건다. 빠뜨리면 전 기간을 스캔해 비용이 튄다. 쿼리당 스캔 상한도 건다.
 *  - 활성 = SDK `user_engagement`(앱이 앞에 떠 있을 때), 세션 = SDK `ga_session_id`.
 *    앱 자체 세션(`app_session_start`, 30분 기준)과 섞지 않는다.
 *  - 이 앱은 setUserId 를 안 부른다 — 전부 기기 단위(`user_pseudo_id`). 재설치하면 다른 사람으로 센다.
 *
 * Next 에 의존하지 않는다(캐시는 라우트가 건다). `scripts/probe-bq-check.mts` 가 같은 함수를 부른다.
 */

export const DEFAULT_DATASET = "wouldulike-efe19.analytics_494806625";
const MAX_BYTES = String(1024 ** 3); // 쿼리당 1GB — 넘으면 BigQuery 가 실행을 거절한다

export interface Ga4AppMetrics {
  /** 마지막 확정 테이블 날짜 (YYYY-MM-DD) — "○일까지" */
  through: string;
  week: { from: string; to: string };
  wau: number | null;
  /** 7일 평균 DAU ÷ WAU, % */
  dau_wau: number | null;
  /** SDK 세션 중 매장 상세를 연 세션 비율, % */
  open_to_store: number | null;
  sessions: number;
  /** 첫 실행 코호트 중 7~13일째 다시 활성인 비율, % */
  retention_w1: number | null;
  cohort: { from: string; to: string; users: number };
}

export type Ga4Read = { ok: true; data: Ga4AppMetrics } | { ok: false; reason: "no_key" | "error"; detail?: string };

/** GCP_SA_KEY — 서비스 계정 JSON 원문 또는 base64. 권한은 BigQuery 작업 사용자(프로젝트) + 데이터 뷰어(데이터셋)만. */
export function credentialsFromEnv(env: Record<string, string | undefined> = process.env): Record<string, string> | null {
  const raw = env.GCP_SA_KEY?.trim();
  if (!raw) return null;
  const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(text);
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const dash = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
function shift(s: string, days: number): string {
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export async function readGa4AppMetrics(env: Record<string, string | undefined> = process.env): Promise<Ga4Read> {
  const credentials = credentialsFromEnv(env);
  if (!credentials) return { ok: false, reason: "no_key" };
  const dataset = env.BQ_DATASET || DEFAULT_DATASET;
  const [project] = dataset.split(".");
  const bq = new BigQuery({ projectId: project, credentials });
  const run = async <T>(query: string, params?: Record<string, string>): Promise<T[]> => {
    const [rows] = await bq.query({ query, ...(params ? { params } : {}), maximumBytesBilled: MAX_BYTES });
    return rows as T[];
  };

  // 마지막 확정 테이블 — export 가 늦는 날도 있어 "어제"로 가정하지 않는다. 메타 테이블이라 스캔 비용이 없다.
  const [last] = await run<{ t: string | null }>(
    `SELECT MAX(table_id) AS t FROM \`${dataset}.__TABLES__\` WHERE REGEXP_CONTAINS(table_id, r'^events_[0-9]{8}$')`
  );
  if (!last?.t) return { ok: false, reason: "error", detail: "확정 테이블(events_YYYYMMDD)이 없습니다" };
  const end = last.t.slice("events_".length);
  const start = shift(end, -6);
  const events = `\`${dataset}.events_*\``;

  // ① WAU · DAU/WAU — 7일 창. DAU 평균은 7로 나눈다(사용자가 0인 날도 하루로 친다).
  const [act] = await run<{ wau: number; dau_sum: number }>(
    `WITH e AS (
       SELECT event_date, user_pseudo_id FROM ${events}
       WHERE _TABLE_SUFFIX BETWEEN @start AND @end AND event_name = 'user_engagement'
     )
     SELECT (SELECT COUNT(DISTINCT user_pseudo_id) FROM e) AS wau,
            (SELECT IFNULL(SUM(n), 0) FROM (SELECT COUNT(DISTINCT user_pseudo_id) AS n FROM e GROUP BY event_date)) AS dau_sum`,
    { start, end }
  );

  // ② 앱 열기 → 매장 상세 — 앱을 연(session_start 가 있는) SDK 세션 중 restaurant_detail_open 이 있는 비율
  const [ses] = await run<{ sessions: number; with_detail: number }>(
    `WITH ev AS (
       SELECT user_pseudo_id, event_name,
              (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS sid
       FROM ${events}
       WHERE _TABLE_SUFFIX BETWEEN @start AND @end AND event_name IN ('session_start', 'restaurant_detail_open')
     ), s AS (
       SELECT user_pseudo_id, sid,
              LOGICAL_OR(event_name = 'session_start') AS opened,
              LOGICAL_OR(event_name = 'restaurant_detail_open') AS detail
       FROM ev WHERE sid IS NOT NULL GROUP BY user_pseudo_id, sid
     )
     SELECT COUNT(*) AS sessions, COUNTIF(detail) AS with_detail FROM s WHERE opened`,
    { start, end }
  );

  // ③ 가입 1주 후 복귀 — 첫 실행(first_open) 코호트 7일치, 각자 7~13일째에 활성이면 복귀.
  //    복귀 창이 확정 테이블 안에 다 들어오도록 코호트를 end-20 ~ end-14 로 잡는다.
  const cStart = shift(end, -20);
  const cEnd = shift(end, -14);
  const [ret] = await run<{ cohort: number; returned: number }>(
    `WITH f AS (
       SELECT user_pseudo_id, MIN(PARSE_DATE('%Y%m%d', event_date)) AS d FROM ${events}
       WHERE _TABLE_SUFFIX BETWEEN @cStart AND @cEnd AND event_name = 'first_open'
       GROUP BY user_pseudo_id
     ), a AS (
       SELECT DISTINCT user_pseudo_id, PARSE_DATE('%Y%m%d', event_date) AS d FROM ${events}
       WHERE _TABLE_SUFFIX BETWEEN @rStart AND @end AND event_name = 'user_engagement'
     )
     SELECT COUNT(DISTINCT f.user_pseudo_id) AS cohort,
            COUNT(DISTINCT IF(a.user_pseudo_id IS NULL, NULL, f.user_pseudo_id)) AS returned
     FROM f LEFT JOIN a
       ON a.user_pseudo_id = f.user_pseudo_id
      AND a.d BETWEEN DATE_ADD(f.d, INTERVAL 7 DAY) AND DATE_ADD(f.d, INTERVAL 13 DAY)`,
    { cStart, cEnd, rStart: shift(cStart, 7), end }
  );

  const wau = Number(act?.wau ?? 0);
  const sessions = Number(ses?.sessions ?? 0);
  const cohort = Number(ret?.cohort ?? 0);
  return {
    ok: true,
    data: {
      through: dash(end),
      week: { from: dash(start), to: dash(end) },
      wau: act ? wau : null,
      dau_wau: pct(Number(act?.dau_sum ?? 0) / 7, wau),
      open_to_store: pct(Number(ses?.with_detail ?? 0), sessions),
      sessions,
      retention_w1: pct(Number(ret?.returned ?? 0), cohort),
      cohort: { from: dash(cStart), to: dash(cEnd), users: cohort },
    },
  };
}
