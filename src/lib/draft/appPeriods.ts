/**
 * Probe · 앱 지표의 **기간** — 칸마다 센 구간이 다르다.
 *
 * DB 칸은 이번 달 누계(읽을 때마다 새로 셈)이고, GA4 칸은 확정 테이블의 마지막 날에서 거꾸로 잡은 창이다.
 * 그 안에서도 MAU 는 30일, 푸시 열기는 14일, 복귀는 첫 실행 코호트, 배너 → 쿠폰은 클릭 4주 + 7일 추적이다.
 * 전에는 이 날짜가 칸 설명 문장 앞에 제각각 붙어 있어서(`10/7~10/13 앱을 켠…`, `9/23~9/29 첫 실행…`)
 * 어느 칸이 언제 숫자인지 한눈에 안 보였고, DB 칸 대부분은 기간이 아예 안 적혀 있었다(1014).
 *
 * 그래서 칸은 기간 **이름**(이번 달 · 7일 · 30일 …)만 달고, 이름 → 날짜는 이 한 곳에서 정해 화면 위 기간 줄에 한 번 적는다.
 * 구간 자체는 바꾸지 않는다 — 응답에 실제로 센 구간을 옮겨 적을 뿐이다.
 */

export type AppPeriodKey = "month" | "now" | "week" | "mau" | "push" | "cohort" | "banner";

export interface AppPeriod {
  key: AppPeriodKey;
  /** 칸의 칩에 붙는 짧은 이름 */
  label: string;
  /** 실제로 센 구간 — 못 읽었으면 null(칸이 비어 있다) */
  range: string | null;
  /** 이 기간을 쓰는 칸 · 왜 이 길이인가 */
  note: string;
  group: "db" | "ga4";
}

/** 칩 이름 — 응답이 없어도(못 읽어도) 칸의 칩은 이 이름을 단다 */
export const PERIOD_LABEL: Record<AppPeriodKey, string> = {
  month: "이번 달", now: "지금", week: "7일", mau: "30일", push: "14일", cohort: "코호트", banner: "4주",
};

interface Window { from: string; to: string }
export interface AppPeriodInput {
  /** 백엔드 app-stats 의 `since`(이번 달 1일 0시 KST, ISO) */
  since?: string | null;
  /** 백엔드가 센 시각(ISO) — DB 칸의 「지금」 */
  countedAt?: string | null;
  ga4: { week: Window; cohort: Window; push: Window; banner: Window } | null;
}

const KST = 9 * 3_600_000;
/** ISO(시각) → KST 날짜 YYYY-MM-DD. 날짜만 온 값(YYYY-MM-DD)은 그대로 */
const kstDay = (iso: string) => (iso.length === 10 ? iso : new Date(Date.parse(iso) + KST).toISOString().slice(0, 10));
const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
/** 같은 달이면 뒤쪽 달을 줄이지 않는다 — 「10/7~10/13」. 날짜 둘이 같으면 하나만 */
const span = (from: string, to: string) => (from === to ? md(from) : `${md(from)}~${md(to)}`);
const shift = (d: string, days: number) => new Date(Date.parse(d) + days * 86_400_000).toISOString().slice(0, 10);
const hm = (iso: string) => new Date(Date.parse(iso) + KST).toISOString().slice(11, 16);

/**
 * 화면 위 기간 줄 — DB 쪽 둘, GA4 쪽 다섯. 칸이 쓰지 않는 기간도 늘 적는다(칸 구성은 고정이다).
 * GA4 를 못 읽었으면 GA4 쪽 range 는 null 이다.
 */
export function appPeriods({ since, countedAt, ga4 }: AppPeriodInput): AppPeriod[] {
  const today = countedAt ? kstDay(countedAt) : null;
  const first = since ? kstDay(since) : null;
  const g = ga4;
  return [
    { key: "month", label: PERIOD_LABEL.month, group: "db",
      range: first && today ? span(first, today) : null,
      note: "가입 · 쿠폰 · 스탬프 · 마일리지 · 푸시 발송. 달 초엔 작게 나온다" },
    { key: "now", label: PERIOD_LABEL.now, group: "db",
      range: countedAt ? `${md(kstDay(countedAt))} ${hm(countedAt)}` : null,
      note: "누적 가입자 · 7일 안에 만료" },
    { key: "week", label: PERIOD_LABEL.week, group: "ga4",
      range: g ? span(g.week.from, g.week.to) : null,
      note: "WAU · DAU · 퍼널 · 온보딩 · 배너 노출" },
    { key: "mau", label: PERIOD_LABEL.mau, group: "ga4",
      // MAU 는 7일 창과 같은 날에서 끝나는 30일이다(appMetrics.ts mStart)
      range: g ? span(shift(g.week.to, -29), g.week.to) : null,
      note: "MAU · WAU/MAU" },
    { key: "push", label: PERIOD_LABEL.push, group: "ga4",
      range: g ? span(g.push.from, g.push.to) : null,
      note: "푸시 → 앱 열기. 7일이면 수신이 적어 넓혔다" },
    { key: "cohort", label: PERIOD_LABEL.cohort, group: "ga4",
      range: g ? `${span(g.cohort.from, g.cohort.to)} 첫 실행` : null,
      note: g ? `7~13일째 다시 켰는지를 ${md(g.week.to)}까지 본다` : "첫 실행 뒤 7~13일째 다시 켰는지" },
    { key: "banner", label: PERIOD_LABEL.banner, group: "ga4",
      range: g ? `${span(g.banner.from, g.banner.to)} 배너 클릭` : null,
      note: g ? `누른 뒤 7일 안에 쿠폰을 썼는지를 ${md(g.week.to)}까지 본다` : "누른 뒤 7일 안에 쿠폰을 썼는지" },
  ];
}
