import { test } from "node:test";
import assert from "node:assert/strict";
import { axisTicks, compactKo, dayRange, groupCounts, medianLikeBackend, monthBounds, monthTick, niceMax, normalizeTrend, otherPostsForList, trendForGroup, unknownBeforePlans, type RawTrend } from "../src/lib/draft/insightsTrend";
import type { Trend, TrendPoint } from "../src/app/api/probe/insights/summary/route";

/** 인스타 성과 추이 화면의 축 계산 — 틀려도 그림에서 잘 안 보이는 것들. */

test("축 끝값은 max 이상인 깔끔한 값", () => {
  assert.equal(niceMax(0), 1, "값이 없으면 0 으로 나누지 않게 1");
  assert.equal(niceMax(7), 10);
  assert.equal(niceMax(17), 20);
  assert.equal(niceMax(20), 20);
  assert.equal(niceMax(2_100), 2_500);
  assert.equal(niceMax(4_300), 5_000);
  assert.equal(niceMax(51_000), 100_000);
});

test("달 경계는 KST 자정 — 12월 다음은 다음 해 1월", () => {
  const [s, e] = monthBounds("2026-09");
  assert.equal(new Date(s).toISOString(), "2026-08-31T15:00:00.000Z");
  assert.equal(new Date(e).toISOString(), "2026-09-30T15:00:00.000Z");
  assert.equal(new Date(monthBounds("2025-12")[1]).toISOString(), "2025-12-31T15:00:00.000Z");
  // KST 9/1 00:30 게시물은 9월 안에 든다 (UTC 로는 8/31)
  const t = Date.parse("2026-09-01T00:30:00+09:00");
  assert.ok(t >= s && t < e);
});

test("x 축 이름은 첫 달·1월·마지막 달만", () => {
  const months = ["2024-11", "2024-12", "2025-01", "2025-02", "2026-01", "2026-10"];
  assert.deepEqual(months.map((p, i) => monthTick(p, i, months.length)), ["24.11", null, "25.1", null, "26.1", "26.10"]);
});

test("조회수 축 숫자 — 만 단위부터 줄인다", () => {
  assert.equal(compactKo(9_999), "9,999");
  assert.equal(compactKo(12_000), "1.2만");
});

test("축 눈금 — 가운데가 정수일 때만", () => {
  assert.deepEqual(axisTicks(20), [20, 10, 0]);
  assert.deepEqual(axisTicks(25), [25, 0], "12.5건 눈금은 없다");
  assert.deepEqual(axisTicks(1), [1, 0]);
});

const pt = (id: number, basis: string) => ({ id, posted_at: "2026-09-01T10:00:00+09:00", format: "carousel", permalink: "", basis, views: 100, measured_days: 14.2 });
const raw = (over: Partial<RawTrend>): RawTrend => ({ months: [], recent: { days: 28, posts: 0, by_format: {} }, points: [], counts: {}, archived_excluded: 0, ...over } as RawTrend);

test("14일차 백엔드(1009) — day 와 timely 를 그대로", () => {
  const t = normalizeTrend(raw({ day: 14, points: [pt(1, "timely"), pt(2, "late")] as RawTrend["points"], counts: { timely: 1, late: 1, pending: 0, none: 0 } }));
  assert.equal(t.day, 14);
  assert.deepEqual(t.points.map((p) => p.basis), ["timely", "late"]);
  assert.deepEqual(t.counts, { timely: 1, late: 1, pending: 0, none: 0 });
});

test("옛 백엔드 — day 가 없으면 7일차, d7 은 timely 로 (대시보드가 먼저 나가도 점이 비지 않게)", () => {
  const t = normalizeTrend(raw({ points: [pt(1, "d7"), pt(2, "pending")] as RawTrend["points"], counts: { d7: 1, late: 0, pending: 1, none: 0 } }));
  assert.equal(t.day, 7);
  assert.deepEqual(t.points.map((p) => p.basis), ["timely", "pending"]);
  assert.deepEqual(t.counts, { timely: 1, late: 0, pending: 1, none: 0 });
});

test("N일차로 인정하는 나이 — 백엔드 timely_bounds 와 같다", () => {
  assert.equal(dayRange(14), "14~16일");
  assert.equal(dayRange(7), "7~9일");
  assert.equal(dayRange(1), "1~2일", "1일차는 여유가 1일");
});

// ── 제휴 · 제휴 아님 (1123) ──

const gpt = (id: number, posted_at: string, partner: boolean, basis: TrendPoint["basis"], views: number | null, format = "carousel"): TrendPoint =>
  ({ id, posted_at, format, permalink: "", basis, views, measured_days: 14.1, partner, topic: partner ? "x (라라더 포함)" : "", plan_id: partner ? id : null });

function splitTrend(points: TrendPoint[]): Trend {
  return {
    day: 14,
    months: [
      { period: "2026-09", label: "2026년 9월", posts: points.length, by_format: {} },
      { period: "2026-10", label: "2026년 10월", posts: 0, by_format: {} },
    ],
    recent: { days: 28, posts: 0, by_format: {} },
    points,
    counts: { timely: 0, late: 0, pending: 0, none: 0 },
    archived_excluded: 2,
    split: { ok: true },
  };
}

test("중앙값은 백엔드 _median 과 같다 — 짝수면 파이썬 round(반올림 짝수)", () => {
  assert.equal(medianLikeBackend([]), null);
  assert.equal(medianLikeBackend([3, 1, 2]), 2);
  assert.equal(medianLikeBackend([1, 4]), 2, "2.5 → 2 (파이썬 round)");
  assert.equal(medianLikeBackend([2, 5]), 4, "3.5 → 4");
  assert.equal(medianLikeBackend([1, 2]), 2, "1.5 → 2");
  assert.equal(medianLikeBackend([10, 13]), 12, "11.5 → 12");
});

test("묶음을 고르면 발행 수 · 중앙값을 그 묶음 점으로 다시 센다, 달 목록은 그대로", () => {
  const ps = [
    ...[100, 200, 300, 400, 500].map((v, i) => gpt(i + 1, `2026-09-0${i + 1}T10:00:00+09:00`, false, "timely", v)),
    gpt(6, "2026-09-06T10:00:00+09:00", false, "late", 99_999),
    gpt(7, "2026-09-07T10:00:00+09:00", true, "timely", 7_000),
    gpt(8, "2026-09-08T10:00:00+09:00", true, "pending", 50, "reel"),
  ];
  const t = splitTrend(ps);
  const other = trendForGroup(t, "other", Date.parse("2026-09-20T00:00:00+09:00")); // 4주 전 = 8/23 — 9월 게시물 전부
  assert.deepEqual(other.months.map((m) => m.period), ["2026-09", "2026-10"], "가로축이 그대로");
  assert.equal(other.months[0].posts, 6);
  assert.deepEqual(other.months[0].by_format.carousel, { posts: 6, timely: 5, views_median: 300 }, "늦게 잰 값은 중앙값에 안 든다");
  assert.deepEqual(other.months[1].by_format, {});
  assert.equal(other.points.length, 6);
  assert.deepEqual(other.counts, { timely: 5, late: 1, pending: 0, none: 0 });
  assert.equal(other.archived_excluded, 0, "지운 게시물은 묶음을 모른다");
  assert.deepEqual(other.recent, { days: 28, posts: 6, by_format: { carousel: 6 } });

  const partner = trendForGroup(t, "partner", Date.parse("2026-10-01T00:00:00+09:00"));
  assert.equal(partner.months[0].posts, 2);
  assert.deepEqual(partner.months[0].by_format.carousel, { posts: 1, timely: 1, views_median: null }, "5건 미만은 중앙값 없음");
  assert.deepEqual(partner.months[0].by_format.reel, { posts: 1, timely: 0, views_median: null });
  assert.deepEqual(groupCounts(t), { all: 8, partner: 2, other: 6, unknown: 0 });
  assert.equal(trendForGroup(t, "all"), t, "전체는 백엔드 값 그대로");
});

test("나누지 못한 응답이면 묶음을 골라도 전체, 숫자 칸 없음", () => {
  const t = { ...splitTrend([gpt(1, "2026-09-01T10:00:00+09:00", false, "timely", 1)]), split: { ok: false, reason: "x" } };
  assert.equal(trendForGroup(t, "other"), t);
  assert.equal(groupCounts(t), null);
});

test("달은 KST 로 — 10/1 00:30 KST 게시물은 10월", () => {
  const t = splitTrend([gpt(1, "2026-10-01T00:30:00+09:00", false, "timely", 1)]);
  const g = trendForGroup(t, "other");
  assert.equal(g.months[0].posts, 0);
  assert.equal(g.months[1].posts, 1);
});

test("매장 리포트 「제휴 아님」 줄 — 이번 달 + 앞 두 달(KST), 최근 것부터, 제휴는 빼고", () => {
  const t = splitTrend([
    gpt(1, "2026-08-31T23:30:00+09:00", false, "timely", 1), // 석 달 밖
    gpt(2, "2026-09-01T00:10:00+09:00", false, "late", 2),
    gpt(3, "2026-11-20T10:00:00+09:00", false, "pending", 3),
    gpt(4, "2026-10-10T10:00:00+09:00", true, "timely", 4),
  ]);
  const rows = otherPostsForList(t, Date.parse("2026-11-23T12:00:00+09:00"));
  assert.deepEqual(rows?.map((p) => p.id), [3, 2]);
  assert.equal(otherPostsForList({ ...t, split: { ok: false } }), null, "못 나눴으면 「없음」이 아니라 모름");
});

test("기획 기록 전 게시물은 모름 — 어느 묶음에도 안 들고 수만 따로(1125)", () => {
  // 기획 없는 6/1 · 8/19, 기획 붙은 첫 게시물 8/20(제휴 아님 제목), 그 뒤 기획 없이 올린 9/1, 제휴 9/2
  const raw = [
    gpt(1, "2026-06-01T10:00:00+09:00", false, "late", 1),
    gpt(2, "2026-08-19T10:00:00+09:00", false, "late", 2),
    { ...gpt(3, "2026-08-20T10:00:00+09:00", false, "timely", 3), plan_id: 3, topic: "중간고사" },
    gpt(4, "2026-09-01T10:00:00+09:00", false, "timely", 4),
    gpt(5, "2026-09-02T10:00:00+09:00", true, "timely", 5),
  ];
  const { points, since } = unknownBeforePlans(raw);
  assert.equal(since, "2026-08-20T10:00:00+09:00");
  assert.deepEqual(points.map((p) => p.partner), [null, null, false, false, true]);
  const t = splitTrend(points);
  assert.deepEqual(groupCounts(t), { all: 5, partner: 1, other: 2, unknown: 2 });
  assert.deepEqual(trendForGroup(t, "other").points.map((p) => p.id), [3, 4]);
  assert.deepEqual(trendForGroup(t, "partner").points.map((p) => p.id), [5]);
  assert.deepEqual(otherPostsForList(t, Date.parse("2026-09-30T12:00:00+09:00"))?.map((p) => p.id), [4, 3]);
});

test("기획이 하나도 없으면 전부 모름", () => {
  const { points, since } = unknownBeforePlans([gpt(1, "2026-09-01T10:00:00+09:00", false, "late", 1)]);
  assert.equal(since, null);
  assert.equal(points[0].partner, null);
});
