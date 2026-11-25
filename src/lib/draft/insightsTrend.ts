/**
 * 인스타 성과 추이 화면의 순수 계산 — 축 끝값, 달 경계, x 축 이름.
 * 화면(InsightsSummary.tsx)에서 빼 둔 이유: 그림은 눈으로 보지만 이 셋은 틀려도 눈에 잘 안 띈다.
 */

import type { Trend, TrendPoint } from "@/app/api/probe/insights/summary/route";

/** 옛 백엔드(~1009) 모양 — `day` 가 없고 제때 잰 점이 basis `d7` 이다 */
export type RawTrend = Omit<Trend, "day" | "points" | "counts"> & {
  day?: number;
  points: (Omit<TrendPoint, "basis"> & { basis: TrendPoint["basis"] | "d7" })[];
  counts: Partial<Record<TrendPoint["basis"] | "d7", number>>;
};

/**
 * 백엔드 trend 를 한 모양으로. 1009 백엔드부터 점 · 중앙값이 **14일차**이고 `day: 14` · basis `timely` 로 온다.
 * 그 전 백엔드는 `day` 없이 basis `d7`(7일차) — 대시보드가 먼저 나가도 그림이 비지 않게 여기서 맞춘다.
 */
export function normalizeTrend(t: RawTrend): Trend {
  const c = t.counts;
  return {
    ...t,
    day: t.day ?? 7,
    points: t.points.map((p) => ({ ...p, basis: p.basis === "d7" ? "timely" : p.basis })),
    counts: { timely: c.timely ?? c.d7 ?? 0, late: c.late ?? 0, pending: c.pending ?? 0, none: c.none ?? 0 },
  };
}

/** N일차로 인정하는 나이 「14~16일」 — 백엔드 cohort.timely_bounds 와 같다(여유 2일, 단 N 보다 길지 않게) */
export function dayRange(day: number): string {
  return `${day}~${day + Math.min(2, day)}일`;
}

/** 점 그림이 보여 주는 기간(이번 달 포함). 그 전 게시물은 발행 수 막대와 월별 표에만 있다. */
export const DOT_MONTHS = 6;

/** 축 끝을 깔끔한 값으로 — 1·2·2.5·5 × 10ⁿ 중 max 이상인 가장 작은 것. 값이 없으면 1. */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

/** 축 눈금 — 끝·가운데·0. 가운데가 정수가 아니면(끝이 25 등) 끝과 0 만 — 「12.5건」 같은 눈금은 없다. */
export function axisTicks(top: number): number[] {
  return Number.isInteger(top / 2) ? [top, top / 2, 0] : [top, 0];
}

/** "2026-09" → 그 달 1일 0시와 다음 달 1일 0시(KST)의 epoch ms. 게시 시각이 KST 로 오므로 경계도 KST 로 잡는다. */
export function monthBounds(period: string): [number, number] {
  const [y, m] = period.split("-").map(Number);
  const iso = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01T00:00:00+09:00`;
  return [Date.parse(iso(y, m)), Date.parse(m === 12 ? iso(y + 1, 1) : iso(y, m + 1))];
}

/**
 * 월별 막대의 x 축 이름 — 첫 달·1월·마지막 달만 "YY.M". 스무 개 넘는 막대 밑에 전부 쓰면 겹친다.
 * 나머지 달은 막대에 올리면(툴팁) 보이고, 월별 표에도 있다.
 */
export function monthTick(period: string, i: number, count: number): string | null {
  const [y, m] = period.split("-").map(Number);
  if (i === 0 || i === count - 1 || m === 1) return `${String(y).slice(2)}.${m}`;
  return null;
}

/** 조회수 축 숫자 — 만 단위가 넘으면 「1.2만」 */
export function compactKo(v: number): string {
  return v >= 10_000 ? new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(v) : v.toLocaleString("ko-KR");
}

// ── 제휴 · 제휴 아님 (1123 민찬) ─────────────────────────────────────────────

export type TrendGroup = "all" | "partner" | "other";
export const TREND_GROUP_KO: Record<TrendGroup, string> = { all: "전체", partner: "제휴 매장", other: "제휴 아님" };

/** 백엔드 performance_summary 와 같은 값 — 표본이 이보다 적으면 중앙값을 내지 않는다, 「최근 4주」 */
const MIN_FOR_MEDIAN = 5;
const RECENT_DAYS = 28;

/** 백엔드 `_median` 과 같은 값 — 짝수면 가운데 둘의 평균을 파이썬 round(반올림 짝수)로 */
export function medianLikeBackend(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2) return s[mid];
  const v = (s[mid - 1] + s[mid]) / 2;
  const f = Math.floor(v);
  return v - f === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(v);
}

const kstMonth = (iso: string) => new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 7);

/**
 * 한 묶음(제휴 매장 · 제휴 아님)만의 추이. 「전체」는 백엔드 값 그대로 돌려준다.
 *
 * 달 목록은 전체와 같게 둔다(첫 게시 달 ~ 이번 달) — 묶음을 바꿔도 막대 · 점 그림의 가로축이 그대로여야 견줘 볼 수 있다.
 * 발행 수 · 형식별 건수 · N일차 중앙값(제때 잰 것 5건부터)은 백엔드와 같은 규칙으로 점에서 다시 센다 —
 * 점은 보관 안 된 게시물 전부라 백엔드가 센 것과 같은 모집단이다. 지운 게시물 수는 묶음을 알 수 없어 0 으로 둔다.
 * 나누지 못한 응답(split.ok 아님)이면 묶음을 고를 수 없으니 전체를 돌려준다.
 */
export function trendForGroup(t: Trend, group: TrendGroup, now: number = Date.now()): Trend {
  if (group === "all" || !t.split?.ok) return t;
  const want = group === "partner";
  // partner 가 null(모름 — 기획 기록 전 게시물)이면 어느 묶음에도 안 넣는다
  const points = t.points.filter((p) => p.partner === want);
  const posts = new Map<string, Record<string, number>>();
  const views = new Map<string, number[]>();
  for (const p of points) {
    const m = kstMonth(p.posted_at);
    const c = posts.get(m) ?? {};
    c[p.format] = (c[p.format] ?? 0) + 1;
    posts.set(m, c);
    if (p.basis === "timely") {
      const k = `${m}|${p.format}`;
      views.set(k, [...(views.get(k) ?? []), p.views ?? 0]);
    }
  }
  const months = t.months.map((m) => {
    const c = posts.get(m.period) ?? {};
    const by_format: Trend["months"][number]["by_format"] = {};
    for (const f of Object.keys(c).sort()) {
      const vals = views.get(`${m.period}|${f}`) ?? [];
      by_format[f] = { posts: c[f], timely: vals.length, views_median: vals.length >= MIN_FOR_MEDIAN ? medianLikeBackend(vals) : null };
    }
    return { ...m, posts: Object.values(c).reduce((a, b) => a + b, 0), by_format };
  });
  const since = now - RECENT_DAYS * 86_400_000;
  const recentBy: Record<string, number> = {};
  for (const p of points) if (Date.parse(p.posted_at) >= since) recentBy[p.format] = (recentBy[p.format] ?? 0) + 1;
  const counts = { timely: 0, late: 0, pending: 0, none: 0 };
  for (const p of points) counts[p.basis] += 1;
  return {
    ...t,
    months,
    recent: { days: t.recent.days, posts: Object.values(recentBy).reduce((a, b) => a + b, 0), by_format: recentBy },
    points,
    counts,
    archived_excluded: 0,
  };
}

/**
 * 기획 기록이 생기기 전 게시물은 「모름」(partner = null) — 1125 민찬.
 *
 * 기획(Papillon) 기록은 2026-08-20 게시물부터 있다. 그 전 게시물에 기획이 없는 건 「인스타에서 바로 올림」이 아니라
 * 「기록이 없던 때」라서, 제휴 아님으로 세면 6~8월 점이 전부 제휴 아님이 된다. 기준은 날짜를 박지 않고
 * 기획이 붙은 가장 이른 게시물로 잡는다. 그 뒤에 기획 없이 올린 게시물은 그대로 제휴 아님이다.
 */
export function unknownBeforePlans(points: TrendPoint[]): { points: TrendPoint[]; since: string | null } {
  const since = points.filter((p) => p.plan_id != null).map((p) => p.posted_at).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  const first = since === null ? Infinity : Date.parse(since);
  return { since, points: points.map((p) => (p.plan_id == null && Date.parse(p.posted_at) < first ? { ...p, partner: null } : p)) };
}

/** 묶음별 게시물 수 — 고르는 칸 옆 숫자 + 어느 쪽인지 모르는 수(기획 기록 전). 나누지 못했으면 null */
export function groupCounts(t: Trend): (Record<TrendGroup, number> & { unknown: number }) | null {
  if (!t.split?.ok) return null;
  const partner = t.points.filter((p) => p.partner === true).length;
  const other = t.points.filter((p) => p.partner === false).length;
  return { all: t.points.length, partner, other, unknown: t.points.length - partner - other };
}

/**
 * 매장 리포트 목록의 「제휴 아님」 줄(1123) — 목록과 같은 기간(Papillon 석 달: 이번 달 + 앞 두 달, KST)의 제휴 아닌 게시물, 최근 것부터.
 * 나누지 못한 응답이면 null — 빈 목록(「없음」)과 구별한다.
 */
export function otherPostsForList(t: Trend, now: number = Date.now()): TrendPoint[] | null {
  if (!t.split?.ok) return null;
  const [y, m] = kstMonth(new Date(now).toISOString()).split("-").map(Number);
  const back = new Date(Date.UTC(y, m - 1 - 2, 1));
  const start = monthBounds(`${back.getUTCFullYear()}-${String(back.getUTCMonth() + 1).padStart(2, "0")}`)[0];
  return t.points.filter((p) => p.partner === false && Date.parse(p.posted_at) >= start).sort((a, b) => b.posted_at.localeCompare(a.posted_at));
}
