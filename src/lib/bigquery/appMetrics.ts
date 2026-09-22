import { BigQuery } from "@google-cloud/bigquery";

/**
 * Probe · 앱 지표 — GA4 원본(BigQuery export)에서 읽는 4칸.
 *
 * 앱은 3월부터 GA4 로 이벤트를 보내고 `wouldulike-efe19.analytics_494806625` 에 쌓인다(Event/P0 계측 보고).
 * 여기서 WAU · DAU/WAU · 앱 열기 → 매장 상세 · 가입 1주 후 복귀 · 푸시 → 앱 열기 · 배너 클릭 → 쿠폰 사용을 계산한다.
 *
 * 규칙 (Event/데이터 파이프라인 문서):
 *  - 확정 테이블 `events_YYYYMMDD` 만 읽는다. `events_intraday_*` 는 늦게 온 이벤트가 붙고 결국 지워져 값이 바뀐다.
 *  - 모든 쿼리에 `_TABLE_SUFFIX` 범위를 건다. 빠뜨리면 전 기간을 스캔해 비용이 튄다. 쿼리당 스캔 상한도 건다.
 *  - 활성 = SDK `user_engagement`(앱이 앞에 떠 있을 때), 세션 = SDK `ga_session_id`.
 *    앱 자체 세션(`app_session_start`, 30분 기준)과 섞지 않는다.
 *  - 출시된 앱은 setUserId 를 안 부른다(user_id 0건) — 전부 기기 단위(`user_pseudo_id`). 재설치하면 다른 사람으로 센다.
 *    그래서 DB(쿠폰·가입)와 사용자 단위로 합칠 수 없고, 앱 이벤트끼리만 잇는다.
 *  - 푸시는 Firebase 가 자동으로 남기는 `notification_receive/open` 을 쓴다(firebase_event_origin=fcm).
 *    앱이 직접 남기려던 `notification_open` 은 예약어라 막혔지만 자동 이벤트는 따로 쌓인다.
 *    수신은 안드로이드만 남는다(iOS 는 백그라운드 수신을 못 센다) — 비율은 안드로이드끼리만 낸다.
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
  /** 활성 기기 중 그 주에 처음 앱을 연 기기 수 — WAU 가 뛰었을 때 "새로 온 것"과 "돌아온 것"을 가른다 */
  new_devices: number | null;
  /** 7일 평균 DAU ÷ WAU, % */
  dau_wau: number | null;
  /** SDK 세션 중 매장 상세를 연 세션 비율, % */
  open_to_store: number | null;
  sessions: number;
  /** 첫 실행 코호트 중 7~13일째 다시 활성인 비율, % */
  retention_w1: number | null;
  cohort: { from: string; to: string; users: number };
  /** 안드로이드 푸시 열기 ÷ 수신, % — 14일 창 */
  push_open: number | null;
  push: { from: string; to: string; received: number; opened_android: number; opened_ios: number };
  /** 홈 배너를 누른 기기 중 7일 안에 쿠폰을 쓴 비율, % */
  banner_to_coupon: number | null;
  banner: { from: string; to: string; clicked: number; redeemed: number };
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

interface Client {
  dataset: string;
  run: <T>(query: string, params?: Record<string, string>) => Promise<T[]>;
}

function clientFromEnv(env: Record<string, string | undefined>): Client | null {
  const credentials = credentialsFromEnv(env);
  if (!credentials) return null;
  const dataset = env.BQ_DATASET || DEFAULT_DATASET;
  const [project] = dataset.split(".");
  const bq = new BigQuery({ projectId: project, credentials });
  return {
    dataset,
    run: async <T>(query: string, params?: Record<string, string>): Promise<T[]> => {
      const [rows] = await bq.query({ query, ...(params ? { params } : {}), maximumBytesBilled: MAX_BYTES });
      return rows as T[];
    },
  };
}

// 마지막 확정 테이블 — export 가 늦는 날도 있어 "어제"로 가정하지 않는다. 메타 테이블이라 스캔 비용이 없다.
async function lastEventDate(c: Client): Promise<string | null> {
  const [last] = await c.run<{ t: string | null }>(
    `SELECT MAX(table_id) AS t FROM \`${c.dataset}.__TABLES__\` WHERE REGEXP_CONTAINS(table_id, r'^events_[0-9]{8}$')`
  );
  return last?.t ? last.t.slice("events_".length) : null;
}

/**
 * 어느 날짜까지 확정 테이블이 있는가(YYYYMMDD). 주간 보고서가 "어느 주까지 뽑을 수 있는가"를 이걸로 정한다.
 * 키가 없거나 테이블이 없으면 null.
 */
export async function readLastEventDate(env: Record<string, string | undefined> = process.env): Promise<string | null> {
  const c = clientFromEnv(env);
  return c ? lastEventDate(c) : null;
}

/**
 * `opts.end` 를 주면 **그 날로 끝나는 7일**을 센다 — 주간 보고서가 지난주·그 전주를 같은 정의로 뽑을 때 쓴다.
 * 안 주면 예전 그대로 마지막 확정 테이블 기준 최근 7일이다(Probe 앱 지표 화면).
 * 나머지 창(코호트·푸시·배너)도 전부 `end` 에서 거꾸로 잡히므로 같이 따라 움직인다.
 */
export async function readGa4AppMetrics(
  env: Record<string, string | undefined> = process.env,
  opts: { end?: string } = {}
): Promise<Ga4Read> {
  const client = clientFromEnv(env);
  if (!client) return { ok: false, reason: "no_key" };
  const { dataset, run } = client;

  const end = opts.end ?? (await lastEventDate(client));
  if (!end) return { ok: false, reason: "error", detail: "확정 테이블(events_YYYYMMDD)이 없습니다" };
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

  // ④ 푸시 → 앱 열기 — 14일 창. 7일이면 수신이 백 건 남짓이라 하루 발송에 크게 흔들린다.
  const pStart = shift(end, -13);
  const [push] = await run<{ received: number; opened_android: number; opened_ios: number }>(
    `SELECT COUNTIF(event_name = 'notification_receive' AND platform = 'ANDROID') AS received,
            COUNTIF(event_name = 'notification_open' AND platform = 'ANDROID') AS opened_android,
            COUNTIF(event_name = 'notification_open' AND platform = 'IOS') AS opened_ios
     FROM ${events}
     WHERE _TABLE_SUFFIX BETWEEN @pStart AND @end AND event_name IN ('notification_receive', 'notification_open')`,
    { pStart, end }
  );

  // ⑤ 배너 클릭 → 쿠폰 사용 — 기기의 첫 배너 클릭 뒤 7일 안에 coupon_redeemed 가 있으면 전환.
  //    모든 클릭이 7일을 다 채우도록 클릭 창을 end-34 ~ end-7 로 잡는다(클릭이 적어 4주치).
  const bStart = shift(end, -34);
  const bEnd = shift(end, -7);
  const [ban] = await run<{ clicked: number; redeemed: number }>(
    `WITH c AS (
       SELECT user_pseudo_id, MIN(event_timestamp) AS t FROM ${events}
       WHERE _TABLE_SUFFIX BETWEEN @bStart AND @bEnd AND event_name = 'home_banner_click'
       GROUP BY user_pseudo_id
     ), r AS (
       SELECT user_pseudo_id, event_timestamp AS t FROM ${events}
       WHERE _TABLE_SUFFIX BETWEEN @bStart AND @end AND event_name = 'coupon_redeemed'
     )
     SELECT COUNT(DISTINCT c.user_pseudo_id) AS clicked,
            COUNT(DISTINCT IF(r.user_pseudo_id IS NULL, NULL, c.user_pseudo_id)) AS redeemed
     FROM c LEFT JOIN r
       ON r.user_pseudo_id = c.user_pseudo_id
      AND r.t BETWEEN c.t AND c.t + 7 * 24 * 3600 * 1000000`,
    { bStart, bEnd, end }
  );

  // ⑥ 이번 주 활성 중 신규 — 같은 창에서 first_open 이 있는 기기. WAU 가 뛴 주에 "유입인가 복귀인가"를 가른다.
  const [fresh] = await run<{ new_devices: number }>(
    `WITH a AS (
       SELECT DISTINCT user_pseudo_id FROM ${events}
       WHERE _TABLE_SUFFIX BETWEEN @start AND @end AND event_name = 'user_engagement'
     ), f AS (
       SELECT DISTINCT user_pseudo_id FROM ${events}
       WHERE _TABLE_SUFFIX BETWEEN @start AND @end AND event_name = 'first_open'
     )
     SELECT COUNTIF(f.user_pseudo_id IS NOT NULL) AS new_devices
     FROM a LEFT JOIN f USING (user_pseudo_id)`,
    { start, end }
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
      new_devices: fresh ? Number(fresh.new_devices ?? 0) : null,
      dau_wau: pct(Number(act?.dau_sum ?? 0) / 7, wau),
      open_to_store: pct(Number(ses?.with_detail ?? 0), sessions),
      sessions,
      retention_w1: pct(Number(ret?.returned ?? 0), cohort),
      cohort: { from: dash(cStart), to: dash(cEnd), users: cohort },
      push_open: pct(Number(push?.opened_android ?? 0), Number(push?.received ?? 0)),
      push: {
        from: dash(pStart), to: dash(end),
        received: Number(push?.received ?? 0),
        opened_android: Number(push?.opened_android ?? 0),
        opened_ios: Number(push?.opened_ios ?? 0),
      },
      banner_to_coupon: pct(Number(ban?.redeemed ?? 0), Number(ban?.clicked ?? 0)),
      banner: { from: dash(bStart), to: dash(bEnd), clicked: Number(ban?.clicked ?? 0), redeemed: Number(ban?.redeemed ?? 0) },
    },
  };
}
