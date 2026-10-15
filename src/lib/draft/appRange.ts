/**
 * Probe · 앱 지표 보고서의 **기간 × 단위** — 「지표 보고서 원본」과 「주요 지표 보고서」가 같이 쓴다(민찬 1015).
 *
 * 예전에는 주간(`/r/app`)·월간(`/r/app?type=monthly`) 두 벌이라 지난 주·달을 이어서 볼 수 없었다.
 * 이제 기간(시작~끝)과 단위(일·주·월)를 받아 그 기간을 단위로 자르고, 칸마다 **같은 함수**로 센다.
 * 그래서 주 단위의 한 칸은 주간 보고서, 월 단위의 한 칸은 월간 보고서의 GA4 숫자와 같다.
 *
 * ── 기간은 단위의 경계로 넓힌다 ──
 * 주는 월~일, 월은 1일~말일. 반쪽 주를 온전한 주 옆에 두면 늘 줄어 보인다(주간 보고서가 전주 대비에서 피한 그 사고).
 * 끝은 오늘(KST)까지만 받고, 그 단위가 아직 안 끝났으면 칸은 남기되 「진행 중」으로 단다 — appSeries 가 판정한다.
 *
 * ── 시작은 GA4 첫 확정 테이블 앞으로 못 간다 ──
 * 2026-03-01 앞은 앱 이벤트가 없어 GA4 칸이 전부 빈다. 그 칸을 늘어놓으면 「모든 지표」가 아니게 된다.
 * 넓힌 시작이 그 앞이면 첫 온전한 칸으로 당긴다(주 단위면 3/2 월요일).
 *
 * 여기는 순수 함수만 둔다 — 화면(AppMetrics)과 라우트가 같은 계산을 쓰고, 테스트가 돈다.
 */

export type RangeUnit = "day" | "week" | "month";
export const RANGE_UNITS: RangeUnit[] = ["day", "week", "month"];
export const UNIT_LABEL: Record<RangeUnit, string> = { day: "일", week: "주", month: "월" };

/** GA4 첫 확정 테이블(events_20260301) — BigQuery `__TABLES__` 실측(1015). */
export const DATA_FROM = "20260301";

/**
 * 한 번에 뽑는 칸 수 상한. 칸마다 BigQuery 를 열다섯 번쯤 부른다 — 32칸을 같이 쏴서 10초 남짓(1015 로컬 실측).
 * 1년치 주(53칸)·두 해치 달(24칸)이면 「전체」를 늘 한 장에 담는다.
 */
export const MAX_BUCKETS: Record<RangeUnit, number> = { day: 62, week: 53, month: 24 };

export interface Bucket {
  /** YYYYMMDD — 끝 날짜 포함 */
  start: string;
  end: string;
  /** 표 머리·그래프 축에 쓰는 이름 — 「9/1~9/7」 「9월」 「9/3 수」 */
  label: string;
  days: number;
}

export interface RangeSpec {
  unit: RangeUnit;
  /** 넓힌 뒤의 기간 — YYYYMMDD, 끝 포함 */
  start: string;
  end: string;
  buckets: Bucket[];
  days: number;
  /** 받은 기간을 단위 경계로 넓히거나 당겼는가 — 머리말에 「요청 ○ → 실제 ○」를 적을지 */
  adjusted: boolean;
}

// ── 날짜 ──────────────────────────────────────────────────────────
const utc = (s: string) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
export function shiftDays(s: string, days: number): string {
  const d = utc(s);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}
/** "20260920" → "2026-09-20" */
export const dashed = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const md = (s: string) => `${+s.slice(4, 6)}/${+s.slice(6, 8)}`;
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const daysBetween = (a: string, b: string) => Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000) + 1;

/** "2026-09-20" · "20260920" → "20260920". 달력에 없는 날(2/30)은 null */
export function parseDay(input: string | null | undefined): string | null {
  const t = (input ?? "").trim().replace(/-/g, "");
  if (!/^\d{8}$/.test(t)) return null;
  return ymd(utc(t)) === t ? t : null;
}

/** KST 오늘 — YYYYMMDD */
export function kstToday(nowMs: number = Date.now()): string {
  return ymd(new Date(nowMs + 9 * 3_600_000));
}

/** 그 날이 속한 단위의 첫날 */
export function unitStart(day: string, unit: RangeUnit): string {
  if (unit === "day") return day;
  if (unit === "week") return shiftDays(day, -((utc(day).getUTCDay() + 6) % 7)); // 월요일
  return `${day.slice(0, 6)}01`;
}

/** 그 날이 속한 단위의 끝날 */
export function unitEnd(day: string, unit: RangeUnit): string {
  if (unit === "day") return day;
  if (unit === "week") return shiftDays(unitStart(day, "week"), 6); // 일요일
  const y = +day.slice(0, 4);
  const m = +day.slice(4, 6);
  return ymd(new Date(Date.UTC(y, m, 0))); // 다음 달 0일 = 이 달 말일
}

function bucketLabel(start: string, end: string, unit: RangeUnit, multiYear: boolean): string {
  if (unit === "day") return `${md(start)} ${DOW[utc(start).getUTCDay()]}`;
  if (unit === "week") return `${md(start)}~${md(end)}`;
  return multiYear ? `${start.slice(2, 4)}.${+start.slice(4, 6)}월` : `${+start.slice(4, 6)}월`;
}

/** 이미 경계에 맞춘 기간을 단위로 자른다. */
export function bucketize(start: string, end: string, unit: RangeUnit): Bucket[] {
  const multiYear = start.slice(0, 4) !== end.slice(0, 4);
  const out: Bucket[] = [];
  for (let s = start; s <= end; ) {
    const e = unitEnd(s, unit);
    const last = e > end ? end : e;
    out.push({ start: s, end: last, label: bucketLabel(s, last, unit, multiYear), days: daysBetween(s, last) });
    s = shiftDays(last, 1);
  }
  return out;
}

export type RangeParse = { ok: true; spec: RangeSpec } | { ok: false; error: string };

/**
 * 쿼리(start·end·unit)를 읽어 칸을 만든다. 빠진 값은 「최근 12주 · 주 단위」로 채운다.
 * `today` 는 KST 오늘(YYYYMMDD) — 끝을 그 뒤로 못 둔다.
 */
export function parseRange(q: { start?: string | null; end?: string | null; unit?: string | null }, today: string): RangeParse {
  const unit = (q.unit ?? "week") as RangeUnit;
  if (!RANGE_UNITS.includes(unit)) return { ok: false, error: `단위(unit)는 day · week · month 중 하나입니다 — 받은 값: ${q.unit}` };

  const fallback = defaultRange(today);
  const rawStart = q.start ? parseDay(q.start) : fallback.start;
  const rawEnd = q.end ? parseDay(q.end) : fallback.end;
  if (!rawStart) return { ok: false, error: `시작(start)을 읽지 못했습니다 — "${q.start}". YYYY-MM-DD 로 주세요.` };
  if (!rawEnd) return { ok: false, error: `끝(end)을 읽지 못했습니다 — "${q.end}". YYYY-MM-DD 로 주세요.` };
  if (rawStart > rawEnd) return { ok: false, error: `시작(${dashed(rawStart)})이 끝(${dashed(rawEnd)})보다 늦습니다.` };
  if (rawStart > today) return { ok: false, error: `시작(${dashed(rawStart)})이 오늘보다 뒤입니다.` };

  const cappedEnd = rawEnd > today ? today : rawEnd;
  let start = unitStart(rawStart < DATA_FROM ? DATA_FROM : rawStart, unit);
  // 넓힌 첫 칸이 데이터 시작 앞에 걸치면 다음 칸부터 — 하루치 GA4 로 한 주를 세지 않는다
  if (start < DATA_FROM) start = shiftDays(unitEnd(start, unit), 1);
  const end = unitEnd(cappedEnd, unit);
  if (start > end) return { ok: false, error: `${dashed(DATA_FROM)} 부터 셀 수 있습니다 — 앱 이벤트(GA4)가 그날 시작합니다.` };

  const buckets = bucketize(start, end, unit);
  const max = MAX_BUCKETS[unit];
  if (buckets.length > max) {
    return { ok: false, error: `${UNIT_LABEL[unit]} 단위로는 ${max}칸까지 뽑습니다 — 받은 기간은 ${buckets.length}칸입니다. 기간을 줄이거나 더 큰 단위로 바꿔 주세요.` };
  }
  return {
    ok: true,
    spec: { unit, start, end, buckets, days: daysBetween(start, end), adjusted: start !== rawStart || end !== rawEnd },
  };
}

/** 아무것도 안 주면 — 지난주까지 12주, 주 단위 */
export function defaultRange(today: string): { start: string; end: string; unit: RangeUnit } {
  const end = shiftDays(unitStart(today, "week"), -1); // 지난 일요일
  return { start: shiftDays(end, -12 * 7 + 1), end, unit: "week" };
}

export interface RangePreset {
  key: string;
  label: string;
  start: string;
  end: string;
  unit: RangeUnit;
}

/** 화면·보고서 위 띠의 빠른 선택 — 단위까지 같이 정한다(민찬이 고르기 쉬운 묶음). */
export function rangePresets(today: string): RangePreset[] {
  const lastSun = shiftDays(unitStart(today, "week"), -1);
  const thisMonth = unitStart(today, "month");
  const lastMonthEnd = shiftDays(thisMonth, -1);
  const lastMonth = unitStart(lastMonthEnd, "month");
  return [
    { key: "4w", label: "최근 4주", start: shiftDays(lastSun, -27), end: lastSun, unit: "week" },
    { key: "12w", label: "최근 12주", start: shiftDays(lastSun, -83), end: lastSun, unit: "week" },
    { key: "last-month", label: "지난달", start: lastMonth, end: lastMonthEnd, unit: "day" },
    { key: "this-month", label: "이번 달", start: thisMonth, end: today, unit: "day" },
    { key: "6m", label: "최근 6개월", start: monthsBack(thisMonth, 6), end: lastMonthEnd, unit: "month" },
    { key: "all", label: "전체", start: DATA_FROM, end: today, unit: "month" },
  ];
}

/** 그 달 1일에서 n 달 앞 1일 */
function monthsBack(firstOfMonth: string, n: number): string {
  const y = +firstOfMonth.slice(0, 4);
  const m = +firstOfMonth.slice(4, 6) - 1 - n;
  return ymd(new Date(Date.UTC(y, m, 1)));
}

/** 머리말 한 줄 — 「2026.9.1 ~ 10.12 · 주 단위 6칸」 */
export function rangeLabel(spec: Pick<RangeSpec, "start" | "end" | "unit" | "buckets">): string {
  const s = spec.start, e = spec.end;
  const sameYear = s.slice(0, 4) === e.slice(0, 4);
  const from = `${s.slice(0, 4)}.${+s.slice(4, 6)}.${+s.slice(6, 8)}`;
  const to = sameYear ? `${+e.slice(4, 6)}.${+e.slice(6, 8)}` : `${e.slice(0, 4)}.${+e.slice(4, 6)}.${+e.slice(6, 8)}`;
  return `${from} ~ ${to} · ${UNIT_LABEL[spec.unit]} 단위 ${spec.buckets.length}칸`;
}

/** 링크에 붙일 쿼리 — 화면과 보고서 위 띠가 같은 모양으로 만든다 */
export function rangeQuery(r: { start: string; end: string; unit: RangeUnit }): string {
  return `start=${dashed(r.start)}&end=${dashed(r.end)}&unit=${r.unit}`;
}
