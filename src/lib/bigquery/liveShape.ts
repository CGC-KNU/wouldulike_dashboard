/**
 * Probe · 실시간 지표 — GA4 쪽의 상수 · 타입 · 순수 함수(네트워크 없음, tests/liveShape.test.ts).
 * 화면(LiveMetrics.tsx)이 상수를 가져다 쓰므로 BigQuery 라이브러리를 import 하지 않는다 — 브라우저 번들에 딸려 가지 않게.
 * 읽기는 liveMetrics.ts.
 */

export const LIVE_HOURS = 24;
export const BASELINE_WEEKS = 4;
const HOUR = 3_600_000;
const KST = 9 * HOUR;

/** 기기 수로 세는 단계 — [이벤트, 이름]. 위에서부터 화면 순서 */
export const LIVE_STEPS: [string, string][] = [
  ["restaurant_detail_open", "매장 상세 열람"],
  ["coupon_page_view", "쿠폰함 열람"],
  ["coupon_claim", "쿠폰 고르기"],
  ["coupon_redeem_attempt", "쿠폰 사용 시도"],
  ["coupon_redeemed", "쿠폰 사용"],
  ["login_start", "로그인 시작"],
  ["login_completed", "로그인 완료"],
  ["user_signup_completed", "가입 완료"],
  ["push_open", "푸시로 앱 열기"],
  ["qr_entry", "QR 진입"],
];
/** 실패 이벤트 — 0 보다 크면 화면이 붉게 띄운다. 건수와 기기 수 둘 다 */
export const LIVE_FAILURES: [string, string][] = [
  ["coupon_redeem_failed", "쿠폰 사용 실패"],
  ["stamp_add_failed", "스탬프 적립 실패"],
  ["ticket_purchase_failed", "식사권 구매 실패"],
];

export interface LiveCounts {
  /** 앱이 앞에 떠 있던 기기(user_engagement) */
  active: number;
  active_ios: number;
  active_android: number;
  /** 처음 앱을 연 기기(first_open) */
  new_devices: number;
  /** SDK 세션(session_start) */
  sessions: number;
  /** 이벤트 → 그 이벤트를 보낸 기기 수 */
  steps: Record<string, number>;
  /** 실패 이벤트 → { 건수, 기기 } */
  failures: Record<string, { count: number; devices: number }>;
}

export interface Ga4Live {
  since: string;
  until: string;
  counts: LiveCounts;
  /** KST 정시 칸 — `hour` = "YYYY-MM-DDTHH"(KST). 백엔드 app-stats/live 의 hourly 와 이 키로 맞춘다 */
  hourly: { hour: string; active: number; views: number }[];
  /** 지난 4주 같은 창 평균 — 못 세면 null */
  baseline: { active: number; new_devices: number; sessions: number; steps: Record<string, number>; failures: Record<string, number> } | null;
  /** 날짜별로 무엇을 읽었는가 — provisional = 당일분(잠정) · final = 확정 · missing = 둘 다 없음 */
  days: { date: string; table: "final" | "provisional" | "missing" }[];
  /** 창 안 마지막 앱 이벤트 시각(ISO) — GA4 가 얼마나 늦게 붙는지 보는 단서 */
  last_event_at: string | null;
  /** 읽은 당일분 테이블이 마지막으로 바뀐 시각(ISO) */
  last_loaded_at: string | null;
}

export type Ga4LiveRead = { ok: true; data: Ga4Live } | { ok: false; reason: "no_key" | "error"; detail?: string };

/** 순간 → KST 날짜 "YYYYMMDD" */
export const kstYmd = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10).replace(/-/g, "");
/** 순간 → KST 정시 키 "YYYY-MM-DDTHH" */
export const kstHourKey = (ms: number) => new Date(ms + KST).toISOString().slice(0, 13);
/** 순간 → "YYYY-MM-DDTHH:MM:SS+09:00" */
export const kstIso = (ms: number) => `${new Date(ms + KST).toISOString().slice(0, 19)}+09:00`;

/** 창 [since, until) 이 걸친 KST 날짜들 */
export function windowDays(sinceMs: number, untilMs: number): string[] {
  const out: string[] = [];
  for (let d = kstYmd(sinceMs); ; ) {
    out.push(d);
    if (d >= kstYmd(untilMs - 1)) return out;
    const t = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)) + 24 * HOUR;
    d = new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
  }
}

/** 날짜마다 읽을 테이블 하나 — 확정이 있으면 확정(당일분과 같이 읽으면 두 번 센다), 없으면 당일분 */
export function pickTables(days: string[], existing: Set<string>): { date: string; table: "final" | "provisional" | "missing"; id: string | null }[] {
  return days.map((date) =>
    existing.has(`events_${date}`) ? { date, table: "final", id: `events_${date}` }
      : existing.has(`events_intraday_${date}`) ? { date, table: "provisional", id: `events_intraday_${date}` }
      : { date, table: "missing", id: null });
}

/** KST 정시 칸 키 — 첫 칸은 창 시작이 든 시각(반쪽일 수 있다). 백엔드 live_hourly 와 같은 칸 */
export function hourKeys(sinceMs: number, untilMs: number): string[] {
  const keys: string[] = [];
  for (let t = Math.floor((sinceMs + KST) / HOUR) * HOUR - KST; t < untilMs; t += HOUR) keys.push(kstHourKey(t));
  return keys;
}

export type Row = Record<string, number | null>;
export const n = (v: unknown) => Number(v ?? 0);

export function toCounts(r: Row): LiveCounts {
  return {
    active: n(r.active), active_ios: n(r.active_ios), active_android: n(r.active_android),
    new_devices: n(r.new_devices), sessions: n(r.sessions),
    steps: Object.fromEntries(LIVE_STEPS.map(([ev], i) => [ev, n(r[`s${i}`])])),
    failures: Object.fromEntries(LIVE_FAILURES.map(([ev], i) => [ev, { count: n(r[`f${i}`]), devices: n(r[`fd${i}`]) }])),
  };
}

/** 지난 N주 행 → 평균. 한 주라도 이벤트 0 이면 null */
export function averageWeeks(rows: (Row & { w: number })[], weeks = BASELINE_WEEKS): Ga4Live["baseline"] {
  const byWeek = new Map(rows.map((r) => [n(r.w), r]));
  for (let w = 1; w <= weeks; w++) if (!n(byWeek.get(w)?.events)) return null;
  const all = [...byWeek.values()].filter((r) => n(r.w) >= 1 && n(r.w) <= weeks).map(toCounts);
  const avg = (f: (c: LiveCounts) => number) => Math.round((all.reduce((a, c) => a + f(c), 0) / weeks) * 10) / 10;
  return {
    active: avg((c) => c.active), new_devices: avg((c) => c.new_devices), sessions: avg((c) => c.sessions),
    steps: Object.fromEntries(LIVE_STEPS.map(([ev]) => [ev, avg((c) => c.steps[ev])])),
    failures: Object.fromEntries(LIVE_FAILURES.map(([ev]) => [ev, avg((c) => c.failures[ev].count)])),
  };
}

