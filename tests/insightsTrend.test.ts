import { test } from "node:test";
import assert from "node:assert/strict";
import { axisTicks, compactKo, dayRange, monthBounds, monthTick, niceMax, normalizeTrend, type RawTrend } from "../src/lib/draft/insightsTrend";

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
