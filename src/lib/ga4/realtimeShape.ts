/**
 * Probe · 실시간 지표의 「지금」 칸 — GA4 실시간 API 응답을 화면 모양으로 바꾸는 순수 함수(네트워크 없음, tests/realtimeShape.test.ts).
 * 화면(NowCard.tsx)이 상수를 가져다 쓰므로 인증 라이브러리를 import 하지 않는다. 읽기는 realtime.ts.
 *
 * 민찬 1109: 새 이벤트를 띄운 직후 반응을 보려는 칸, 5분 단위.
 * 실시간 API(표준 속성)는 최근 30분만 준다 → 5분 칸 6개. 0번 칸이 지금(아직 덜 찬 칸)이다.
 * 사람 수는 칸마다 따로 물어 센다 — 분 단위 사람 수를 더하면 한 사람이 여러 번 세진다. 이벤트 건수는 더해도 된다.
 */

export const NOW_BUCKET_MIN = 5;
export const NOW_BUCKETS = 6; // 30분 ÷ 5분
export const NOW_EVENT_ROWS = 12;

/** [startMinutesAgo, endMinutesAgo] — 0번이 지금. 실시간 API minuteRanges 모양 그대로 */
export const nowRanges = (): { name: string; startMinutesAgo: number; endMinutesAgo: number }[] =>
  Array.from({ length: NOW_BUCKETS }, (_, i) => ({
    name: `b${i}`,
    startMinutesAgo: i * NOW_BUCKET_MIN + NOW_BUCKET_MIN - 1,
    endMinutesAgo: i * NOW_BUCKET_MIN,
  }));

/** 앱이 자동으로 보내는 이벤트 — 무엇을 했는지보다 「열려 있었다」에 가까워 목록 아래로 내린다 */
export const AUTO_EVENTS = new Set(["screen_view", "user_engagement", "session_start", "first_open", "app_remove", "os_update", "app_update", "app_clear_data", "firebase_campaign"]);

export interface RtRow { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }
export interface RtReport { rows?: RtRow[] }

export interface Ga4Now {
  /** 칸별 앱 사용자 — 0번이 지금(0~4분 전) */
  buckets: { index: number; users: number; events: number }[];
  /** 최근 30분 전체(칸 합이 아니라 따로 센 값) */
  total: { users: number; ios: number; android: number };
  /** 이벤트 × 칸 건수 — 손으로 보낸 이벤트 먼저, 많은 순 */
  events: { name: string; total: number; perBucket: number[]; auto: boolean }[];
  screens: { name: string; users: number }[];
  generated_at: string;
}

const num = (v: string | undefined) => (v ? Number(v) || 0 : 0);
const dim = (r: RtRow, i: number) => r.dimensionValues?.[i]?.value ?? "";
const met = (r: RtRow, i = 0) => num(r.metricValues?.[i]?.value);

/** minutesAgo("00"~"29") → 칸 번호. 범위 밖이면 null */
export function bucketOf(minutesAgo: string): number | null {
  if (!/^\d+$/.test(minutesAgo)) return null; // Number("") 는 0 이다
  const m = Number(minutesAgo);
  const b = Math.floor(m / NOW_BUCKET_MIN);
  return b < NOW_BUCKETS ? b : null;
}

/**
 * 응답 넷을 묶는다.
 * - `bucketUsers`: minuteRanges 두 개씩 물은 보고서들(차원 `dateRange` = "b0"…"b5", 측정 activeUsers)
 * - `platform`: 차원 platform, 측정 activeUsers(30분 전체)
 * - `events`: 차원 minutesAgo · eventName, 측정 eventCount
 * - `screens`: 차원 unifiedScreenName, 측정 activeUsers
 * 사람이 없는 칸은 응답에 행이 아예 없다 → 0 으로 채운다(호출이 성공했을 때만 이 함수에 온다).
 */
export function shapeNow(
  input: { bucketUsers: RtReport[]; platform: RtReport; events: RtReport; screens: RtReport },
  generatedAt: string,
): Ga4Now {
  const users = new Array<number>(NOW_BUCKETS).fill(0);
  for (const rep of input.bucketUsers) {
    for (const r of rep.rows ?? []) {
      const i = Number(dim(r, 0).replace(/^b/, ""));
      if (Number.isInteger(i) && i >= 0 && i < NOW_BUCKETS) users[i] = met(r);
    }
  }

  const total = { users: 0, ios: 0, android: 0 };
  for (const r of input.platform.rows ?? []) {
    const p = dim(r, 0).toLowerCase(), n = met(r);
    if (p === "web") continue; // 호출에서 이미 거르지만 한 번 더
    total.users += n;
    if (p === "ios") total.ios += n;
    else if (p === "android") total.android += n;
  }

  const byEvent = new Map<string, number[]>();
  const eventsPerBucket = new Array<number>(NOW_BUCKETS).fill(0);
  for (const r of input.events.rows ?? []) {
    const b = bucketOf(dim(r, 0));
    const name = dim(r, 1);
    if (b === null || !name) continue;
    const n = met(r);
    const row = byEvent.get(name) ?? new Array<number>(NOW_BUCKETS).fill(0);
    row[b] += n;
    byEvent.set(name, row);
    eventsPerBucket[b] += n;
  }
  const events = [...byEvent.entries()]
    .map(([name, perBucket]) => ({ name, perBucket, total: perBucket.reduce((a, x) => a + x, 0), auto: AUTO_EVENTS.has(name) }))
    .sort((a, b) => Number(a.auto) - Number(b.auto) || b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, NOW_EVENT_ROWS);

  const screens = (input.screens.rows ?? [])
    .map((r) => ({ name: dim(r, 0) || "(이름 없음)", users: met(r) }))
    .filter((s) => s.users > 0)
    .sort((a, b) => b.users - a.users)
    .slice(0, 8);

  return {
    buckets: users.map((u, index) => ({ index, users: u, events: eventsPerBucket[index] })),
    total,
    events,
    screens,
    generated_at: generatedAt,
  };
}

/** 칸 이름 — 0번은 「지금」, 나머지는 「n~m분 전」 */
export function bucketLabel(index: number): string {
  if (index === 0) return "지금";
  const from = index * NOW_BUCKET_MIN;
  return `${from}~${from + NOW_BUCKET_MIN - 1}분 전`;
}
