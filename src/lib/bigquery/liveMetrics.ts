import { clientFromEnv, type Client } from "./appMetrics";
import {
  BASELINE_WEEKS, LIVE_FAILURES, LIVE_HOURS, LIVE_STEPS, averageWeeks, hourKeys, kstIso, kstYmd, n, pickTables, toCounts, windowDays,
  type Ga4Live, type Ga4LiveRead, type Row,
} from "./liveShape";

export type { Ga4Live, Ga4LiveRead } from "./liveShape";

/**
 * Probe · 실시간 지표 — GA4 쪽. 창은 늘 **[지금 − 24시간, 지금)** (민찬 1108, 오늘 0시부터가 아니다).
 *
 * ── 왜 당일분(intraday) 테이블을 읽는가 ──
 * 확정 테이블 `events_YYYYMMDD` 는 **다음 날 오후**에 생긴다(1108 실측: 11/06 분이 11/07 13:44 KST).
 * 그래서 24시간 창은 당일분 `events_intraday_YYYYMMDD`(스트리밍 내보내기) 없이는 비어 있다.
 * 보고서용 `appMetrics.ts` 가 당일분을 일부러 안 읽는 것과 다르다 — 여기 값은 **잠정**이다:
 * 앱 SDK 가 이벤트를 묶어 보내 수 분~1시간 늦게 붙고, 확정 테이블이 생기면 당일분은 지워진다.
 *
 * ── 날짜마다 하나만 ──
 * 창이 걸친 KST 날짜(보통 이틀)마다 확정이 있으면 확정, 없으면 당일분을 읽는다. 둘을 같이 읽으면 같은 이벤트를
 * 두 번 센다(확정이 생긴 직후 잠깐 둘 다 있다). 둘 다 없으면 그날은 `missing` 으로 내려 화면이 「미확인」을 띄운다.
 * 접미사 날짜는 속성 시간대(KST)다 — 당일분 11/08 의 첫 이벤트가 00:55 KST 였다(1108 확인).
 *
 * ── 거르는 것 ──
 * 앱만(`platform IN ('ANDROID','IOS')`) — 웹 스트림이 같은 속성이다(probe-web 1028). 테스트 기기는 앱 지표 GA4 칸과 같이 거르지 않는다.
 * 기기 단위(`user_pseudo_id`) — DB 계정과 1:1 이 아니다(appMetrics.ts 머리 주석).
 *
 * 기준선 = 지난 4주 같은 요일 · 같은 시각 창의 평균(확정 테이블). DB 쪽(app-stats/live)과 같은 규칙.
 * 한 주라도 이벤트가 0 이면(확정 실패로 빈 날) 기준선은 null — 모자란 평균을 기준처럼 보이지 않게.
 *
 * Next 에 의존하지 않는다(캐시는 라우트가 건다).
 */

const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;
const APP = "platform IN ('ANDROID', 'IOS')";
const devicesOf = (ev: string) => `COUNT(DISTINCT IF(event_name = '${ev}', user_pseudo_id, NULL))`;

/** 칸 SELECT 목록 — 지금 창과 기준선이 같은 것을 센다 */
function countColumns(): string {
  return [
    `${devicesOf("user_engagement")} AS active`,
    `COUNT(DISTINCT IF(event_name = 'user_engagement' AND platform = 'IOS', user_pseudo_id, NULL)) AS active_ios`,
    `COUNT(DISTINCT IF(event_name = 'user_engagement' AND platform = 'ANDROID', user_pseudo_id, NULL)) AS active_android`,
    `${devicesOf("first_open")} AS new_devices`,
    `COUNTIF(event_name = 'session_start') AS sessions`,
    ...LIVE_STEPS.map(([ev], i) => `${devicesOf(ev)} AS s${i}`),
    ...LIVE_FAILURES.flatMap(([ev], i) => [`COUNTIF(event_name = '${ev}') AS f${i}`, `${devicesOf(ev)} AS fd${i}`]),
    `COUNT(*) AS events`,
  ].join(",\n       ");
}

export async function readGa4Live(now: number = Date.now(), env: Record<string, string | undefined> = process.env): Promise<Ga4LiveRead> {
  const c: Client | null = clientFromEnv(env);
  if (!c) return { ok: false, reason: "no_key" };
  const until = now;
  const since = now - LIVE_HOURS * HOUR;
  const days = windowDays(since, until);
  try {
    const meta = await c.run<{ table_id: string; mod: number }>(
      `SELECT table_id, last_modified_time AS mod FROM \`${c.dataset}.__TABLES__\`
       WHERE table_id IN UNNEST(@ids)`.replace("@ids", `[${days.flatMap((d) => [`'events_${d}'`, `'events_intraday_${d}'`]).join(",")}]`)
    );
    const picked = pickTables(days, new Set(meta.map((m) => m.table_id)));
    const ids = picked.flatMap((p) => (p.id ? [p.id] : []));
    const provisionalMods = meta.filter((m) => picked.some((p) => p.table === "provisional" && p.id === m.table_id)).map((m) => n(m.mod));
    const last_loaded_at = provisionalMods.length ? new Date(Math.max(...provisionalMods)).toISOString() : null;

    const win = `event_timestamp >= UNIX_MICROS(TIMESTAMP(@since)) AND event_timestamp < UNIX_MICROS(TIMESTAMP(@until)) AND ${APP}`;
    const params = { since: new Date(since).toISOString(), until: new Date(until).toISOString() };
    const src = ids.length
      ? ids.map((id) => `SELECT event_name, user_pseudo_id, event_timestamp, platform FROM \`${c.dataset}.${id}\` WHERE ${win}`).join("\n UNION ALL ")
      : null;

    // 기준선 창 — 지난 1~4주 같은 시각. 확정 테이블만(4주 전 당일분은 이미 지워졌다)
    const bStart = kstYmd(since - BASELINE_WEEKS * WEEK);
    const bEnd = kstYmd(until - WEEK - 1);
    const weekCase = Array.from({ length: BASELINE_WEEKS }, (_, i) => i + 1)
      .map((w) => `WHEN event_timestamp >= UNIX_MICROS(TIMESTAMP(@since)) - ${w * WEEK * 1000} AND event_timestamp < UNIX_MICROS(TIMESTAMP(@until)) - ${w * WEEK * 1000} THEN ${w}`)
      .join(" ");

    const [totals, hourly, base] = await Promise.all([
      src ? c.run<Row & { last_us: number | null }>(`WITH ev AS (${src}) SELECT ${countColumns()}, MAX(event_timestamp) AS last_us FROM ev`, params) : Promise.resolve([] as (Row & { last_us: number | null })[]),
      src ? c.run<{ h: string; active: number; views: number }>(
        `WITH ev AS (${src})
         SELECT FORMAT_TIMESTAMP('%Y-%m-%dT%H', TIMESTAMP_MICROS(event_timestamp), 'Asia/Seoul') AS h,
                ${devicesOf("user_engagement")} AS active, COUNTIF(event_name = 'screen_view') AS views
         FROM ev GROUP BY h`, params) : Promise.resolve([]),
      c.run<Row & { w: number }>(
        `WITH ev AS (
           SELECT event_name, user_pseudo_id, platform, CASE ${weekCase} END AS w
           FROM \`${c.dataset}.events_*\`
           WHERE _TABLE_SUFFIX BETWEEN @bStart AND @bEnd AND ${APP}
         )
         SELECT w, ${countColumns()} FROM ev WHERE w IS NOT NULL GROUP BY w`,
        { ...params, bStart, bEnd }),
    ]);

    const t = totals[0] ?? {};
    const byHour = new Map(hourly.map((h) => [h.h, h]));
    return {
      ok: true,
      data: {
        since: kstIso(since),
        until: kstIso(until),
        counts: toCounts(t),
        hourly: hourKeys(since, until).map((hour) => ({ hour, active: n(byHour.get(hour)?.active), views: n(byHour.get(hour)?.views) })),
        baseline: averageWeeks(base),
        days: picked.map(({ date, table }) => ({ date, table })),
        last_event_at: t.last_us ? new Date(n(t.last_us) / 1000).toISOString() : null,
        last_loaded_at,
      },
    };
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }
}
