import { clientFromEnv } from "./appMetrics";
import type { CastorHealth, Flow } from "@/lib/castor/app";

/**
 * Castor · 이벤트 감시 + 흐름 (1008). GA4 원본(BigQuery export)에서 읽는다.
 *
 * 기획안 Castor 절 C3-C "이벤트가 끊겼는데 모름" — 화면별 핵심 이벤트가 하루 0건이면 경고(10/1 배너 노출 0건 같은 일).
 * 규칙은 appMetrics 와 같다: 확정 테이블 `events_YYYYMMDD` 만 · `_TABLE_SUFFIX` 범위 필수 · 쿼리당 1GB 상한.
 *
 * 흐름(1단계 퍼널 3개)은 **기기 단위**다. 출시본은 setUserId 를 안 불러서 DB(쿠폰 · 가입)와 사람 단위로 못 잇는다.
 * 단계 k 는 "앞 단계를 모두 했고, 직전 단계보다 늦게(같거나) 이 이벤트가 있었던 기기 수" — 창 안의 첫 발생 시각으로 본다.
 */

export const FLOW_DEFS: { key: string; title: string; steps: [string, string][] }[] = [
  { key: "store", title: "매장 상세 → 쿠폰 사용", steps: [["restaurant_detail_open", "매장 상세 열기"], ["coupon_use_screen_view", "쿠폰 사용 화면"], ["coupon_redeem_attempt", "사용 시도(PIN)"], ["coupon_redeemed", "사용 완료"]] },
  { key: "qr", title: "QR · 딥링크 → 방문 적립", steps: [["deep_link_open", "딥링크로 열기"], ["qr_visit_credit", "QR 방문 적립"], ["coupon_use_screen_view", "쿠폰 사용 화면"], ["coupon_redeemed", "사용 완료"]] },
  { key: "signup", title: "로그인 → 가입 완료", steps: [["login_start", "로그인 시작"], ["login_completed", "로그인 완료"], ["user_signup_completed", "가입 완료"], ["onboarding_complete", "온보딩 끝"]] },
];

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const dash = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
function shift(s: string, days: number): string {
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}

export async function readCastorHealth(env: Record<string, string | undefined> = process.env): Promise<CastorHealth> {
  const empty = (reason: string): CastorHealth => ({ ok: false, reason, through: null, window: null, events: [], screen_views: [], user_id_share: null, flows: [] });
  const c = clientFromEnv(env);
  if (!c) return empty("BigQuery 키(GCP_SA_KEY)가 없습니다.");
  const [last] = await c.run<{ t: string | null }>(
    `SELECT MAX(table_id) AS t FROM \`${c.dataset}.__TABLES__\` WHERE REGEXP_CONTAINS(table_id, r'^events_[0-9]{8}$')`
  );
  const end = last?.t ? last.t.slice("events_".length) : null;
  if (!end) return empty("확정 테이블이 아직 없습니다.");
  const start = shift(end, -6);
  const T = `\`${c.dataset}.events_*\``;

  const events = await c.run<{ name: string; d7: number; last_day: number; devices7: number }>(
    `SELECT event_name AS name, COUNT(*) AS d7, COUNTIF(_TABLE_SUFFIX = @end) AS last_day, COUNT(DISTINCT user_pseudo_id) AS devices7
       FROM ${T} WHERE _TABLE_SUFFIX BETWEEN @start AND @end GROUP BY name ORDER BY d7 DESC`,
    { start, end }
  );
  const screenViews = await c.run<{ screen: string; views: number }>(
    `SELECT COALESCE((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'firebase_screen'), '(이름 없음)') AS screen, COUNT(*) AS views
       FROM ${T} WHERE _TABLE_SUFFIX BETWEEN @start AND @end AND event_name = 'screen_view' GROUP BY screen ORDER BY views DESC LIMIT 40`,
    { start, end }
  );
  const [uid] = await c.run<{ share: number | null }>(
    `SELECT ROUND(100 * COUNTIF(user_id IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS share FROM ${T} WHERE _TABLE_SUFFIX BETWEEN @start AND @end`,
    { start, end }
  );

  // 흐름 — 단계마다 기기별 첫 시각, 앞 단계보다 늦은 것만 이어진다
  const flows: Flow[] = [];
  for (const f of FLOW_DEFS) {
    const names = f.steps.map(([e]) => e);
    const cols = names.map((e, i) => `MIN(IF(event_name = '${e}', event_timestamp, NULL)) AS t${i}`).join(", ");
    const conds = names.map((_, i) => {
      const chain = Array.from({ length: i + 1 }, (_, k) => (k === 0 ? "t0 IS NOT NULL" : `t${k} IS NOT NULL AND t${k} >= t${k - 1}`)).join(" AND ");
      return `COUNTIF(${chain}) AS s${i}`;
    }).join(", ");
    const [row] = await c.run<Record<string, number>>(
      `WITH d AS (SELECT user_pseudo_id, ${cols} FROM ${T}
                   WHERE _TABLE_SUFFIX BETWEEN @start AND @end AND event_name IN (${names.map((e) => `'${e}'`).join(",")})
                   GROUP BY user_pseudo_id)
       SELECT ${conds} FROM d`,
      { start, end }
    );
    flows.push({ key: f.key, title: f.title, steps: f.steps.map(([event, label], i) => ({ event, label, devices: Number(row?.[`s${i}`] ?? 0) })) });
  }

  return {
    ok: true,
    through: dash(end),
    window: { from: dash(start), to: dash(end) },
    events: events.map((e) => ({ name: e.name, d7: Number(e.d7), last_day: Number(e.last_day), devices7: Number(e.devices7) })),
    screen_views: screenViews.map((s) => ({ screen: s.screen, views: Number(s.views) })),
    user_id_share: uid?.share == null ? null : Number(uid.share),
    flows,
  };
}

export const _test = { shift, ymd };
