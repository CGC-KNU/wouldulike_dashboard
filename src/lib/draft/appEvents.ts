import type { CampaignWeek } from "./campaigns";

/**
 * Probe · 앱 지표 보고서의 **사건 달력** — 캠페인 · 휴일 · 릴리스(1022 기획팀 검토 R5 · S3 · A3).
 *
 * 캠페인 주간(마일리지 2배 · 한정쿠폰)은 Astro 달력과 같은 표(백엔드 `astro/campaigns.py`)를 그대로 읽는다(민찬 1022 D5).
 * 여기에는 **그 표에 없는 것만** 둔다 — 지난 캠페인 하나와 공휴일 · 앱 릴리스. 날짜가 다시 바뀔 일이 없는 것들이다.
 *
 * 쓰는 곳 셋:
 *  - KPI 판정: 사건이 걸린 칸은 색을 칠하지 않는다(판정 유보). 평시 기준선은 사건 없는 주에서만 고른다.
 *  - 그래프: 사건이 걸린 칸에 옅은 띠 · 「이번 칸의 사건」 한 줄.
 *  - 원본 CSV: 칸마다 사건 한 줄.
 *
 * 9월판의 빨강 ▼ 은 「앞 7일」이 학생회 캠페인 꼬리였던 탓이다 — 사건을 모르는 비교는 캠페인이 끝날 때마다 하락을 그린다.
 */

export type AppEventKind = "campaign" | "holiday" | "release";

export interface AppEvent {
  kind: AppEventKind;
  label: string;
  /** YYYYMMDD — 끝 포함 */
  start: string;
  end: string;
}

/** Astro 표에 없는 사건 — 공휴일은 앞뒤 주말까지 한 덩이(학생이 학교에 없다) */
export const FIXED_EVENTS: AppEvent[] = [
  { kind: "campaign", label: "학생회 쿠폰 배포", start: "20260915", end: "20260918" },
  { kind: "holiday", label: "추석 연휴", start: "20260924", end: "20260927" },
  { kind: "holiday", label: "개천절 연휴(10/5 대체휴일)", start: "20261003", end: "20261005" },
  { kind: "holiday", label: "한글날 연휴", start: "20261009", end: "20261011" },
  { kind: "release", label: "앱 2.6.0(iOS 10/12 · 안드로이드 10/14)", start: "20261012", end: "20261014" },
  { kind: "holiday", label: "성탄절 연휴", start: "20261225", end: "20261227" },
];

/**
 * 평시 고정 기준선 — 학기 시작 뒤 캠페인 전 두 주(9/1~14, 기획팀 1022 X6).
 * 「사건 없는 직전 4주」가 3주 넘게 쌓이기 전까지 이 두 주를 기준으로 쓴다(민찬 1022 D4).
 * 주 단위 값과 견줄 수 있게 7일 창 둘로 나눠 센다 — 고유 기기·계정은 14일을 한 번에 세면 주 값의 두 배가 아니다.
 */
export const CALM_FIXED: { start: string; end: string }[] = [
  { start: "20260901", end: "20260907" },
  { start: "20260908", end: "20260914" },
];
export const CALM_FIXED_LABEL = "평시(9/1~14)";
/** 평시 주는 고정 기준선 뒤부터 고른다 — 그 앞(방학)은 같은 학생들이 아니다 */
export const CALM_WEEKS_FROM = "20260915";
/** 평시 주가 이만큼 쌓이면 고정 기준선 대신 그 중앙값을 쓴다(D4) */
export const CALM_WEEKS_MIN = 3;
export const CALM_WEEKS_MAX = 4;

/**
 * 손으로 뺀 값 — 그날 그 지표에서 n 만큼 덜어 낸다. 원본 CSV 의 메타 「제외 목록」에 그대로 적힌다.
 * 계정으로 거를 수 없는 것만 여기 적는다. D9 의 9/7 팀 테스트 쿠폰 사용은 개발자 테스트 계정이라
 * 백엔드가 DB 칸에서 계정째 뺀다(백엔드 #174) — 여기서 또 덜면 두 번 빠진다.
 */
export const EXCLUSIONS: { day: string; key: string; n: number; why: string }[] = [];

/** 늘 걸려 있는 제외 — 「제외 목록」 맨 앞에 적는다. GA4 칸은 기기 단위라 계정으로 못 거른다 */
export const ACCOUNT_EXCLUSION = "개발자 테스트 계정 — DB 칸에서 계정째 뺌(GA4 칸에는 남음)";

const toYmd = (iso: string) => iso.replace(/-/g, "");

/** Astro 캠페인 주간 → 사건. 표가 비었으면(못 읽음) 빈 목록 — 지어내지 않는다 */
export function campaignEvents(weeks: CampaignWeek[]): AppEvent[] {
  return weeks.map((w) => ({ kind: "campaign" as const, label: w.label, start: toYmd(w.start), end: toYmd(w.end) }));
}

/** [start, end] 에 하루라도 걸치는 사건 */
export function eventsIn(events: AppEvent[], start: string, end: string): AppEvent[] {
  return events.filter((e) => e.start <= end && e.end >= start);
}

/** 「한정쿠폰 주간 · 추석 연휴」 — 같은 이름은 한 번만 */
export function eventLabel(events: AppEvent[]): string {
  return [...new Set(events.map((e) => e.label))].join(" · ");
}

const md = (d: string) => `${+d.slice(4, 6)}/${+d.slice(6, 8)}`;
/** 「한정쿠폰 주간 9/14~20」 */
export const eventSpan = (e: AppEvent) => `${e.label} ${md(e.start)}~${e.start.slice(4, 6) === e.end.slice(4, 6) ? +e.end.slice(6, 8) : md(e.end)}`;
