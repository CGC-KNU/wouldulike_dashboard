import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketize, defaultRange, kstToday, parseRange, rangeLabel, rangePresets, unitEnd, unitStart } from "../src/lib/draft/appRange";

/** 앱 지표 보고서(원본 · 주요 지표)의 기간 × 단위 — 1015 */

const TODAY = "20261015"; // 목요일

test("단위의 경계 — 주는 월~일, 월은 1일~말일", () => {
  assert.equal(unitStart("20261015", "week"), "20261012");
  assert.equal(unitEnd("20261015", "week"), "20261018");
  assert.equal(unitStart("20261018", "week"), "20261012"); // 일요일은 그 주의 끝
  assert.equal(unitStart("20261012", "week"), "20261012");
  assert.equal(unitEnd("20260215", "month"), "20260228");
  assert.equal(unitEnd("20261201", "month"), "20261231");
});

test("주 단위로 자르면 칸이 겹치지도 비지도 않는다", () => {
  const b = bucketize("20260831", "20261011", "week");
  assert.equal(b.length, 6);
  assert.deepEqual(b.map((x) => [x.start, x.end]).slice(0, 2), [["20260831", "20260906"], ["20260907", "20260913"]]);
  assert.equal(b[0].label, "8/31~9/6");
  assert.ok(b.every((x) => x.days === 7));
});

test("월 단위 이름 — 해를 넘기면 해를 붙인다", () => {
  assert.deepEqual(bucketize("20260901", "20261031", "month").map((x) => x.label), ["9월", "10월"]);
  assert.deepEqual(bucketize("20261201", "20270131", "month").map((x) => x.label), ["26.12월", "27.1월"]);
  assert.equal(bucketize("20261015", "20261015", "day")[0].label, "10/15 목");
});

test("반쪽 주는 받지 않는다 — 고른 기간을 월~일로 넓힌다", () => {
  const r = parseRange({ start: "2026-09-03", end: "2026-09-30", unit: "week" }, TODAY);
  assert.ok(r.ok);
  assert.equal(r.spec.start, "20260831");
  assert.equal(r.spec.end, "20261004");
  assert.equal(r.spec.adjusted, true);
  assert.equal(r.spec.buckets.length, 5);
});

test("끝은 오늘 뒤로 못 간다 — 이번 주는 진행 중인 칸으로 남는다", () => {
  const r = parseRange({ start: "2026-10-01", end: "2026-12-31", unit: "week" }, TODAY);
  assert.ok(r.ok);
  assert.equal(r.spec.end, "20261018"); // 오늘이 속한 주의 일요일까지
  const m = parseRange({ start: "2026-10-01", end: "2026-10-15", unit: "month" }, TODAY);
  assert.ok(m.ok);
  assert.equal(m.spec.end, "20261031");
  assert.equal(m.spec.buckets.length, 1);
});

test("GA4 첫 날(3/1) 앞으로는 못 간다 — 하루치로 한 주를 세지 않게 다음 칸부터", () => {
  const w = parseRange({ start: "2026-01-01", end: "2026-03-22", unit: "week" }, TODAY);
  assert.ok(w.ok);
  assert.equal(w.spec.start, "20260302"); // 3/1 은 일요일 — 2/23 주에는 GA4 가 하루뿐
  const m = parseRange({ start: "2026-01-01", end: "2026-04-30", unit: "month" }, TODAY);
  assert.ok(m.ok);
  assert.equal(m.spec.start, "20260301");
  const d = parseRange({ start: "2026-02-20", end: "2026-02-28", unit: "day" }, TODAY);
  assert.equal(d.ok, false);
});

test("칸 수 상한 · 잘못된 값은 이유를 말한다", () => {
  const day = parseRange({ start: "2026-03-01", end: "2026-10-15", unit: "day" }, TODAY);
  assert.equal(day.ok, false);
  if (!day.ok) assert.match(day.error, /62칸까지/);
  assert.equal(parseRange({ start: "2026-02-30", end: "2026-10-01", unit: "week" }, TODAY).ok, false);
  assert.equal(parseRange({ start: "2026-10-01", end: "2026-09-01", unit: "week" }, TODAY).ok, false);
  assert.equal(parseRange({ start: "2026-09-01", end: "2026-10-01", unit: "year" }, TODAY).ok, false);
  assert.equal(parseRange({ start: "2026-10-20", end: "2026-10-30", unit: "day" }, TODAY).ok, false);
});

test("아무것도 안 주면 지난주까지 12주", () => {
  const d = defaultRange(TODAY);
  assert.deepEqual(d, { start: "20260720", end: "20261011", unit: "week" });
  const r = parseRange({}, TODAY);
  assert.ok(r.ok);
  assert.equal(r.spec.buckets.length, 12);
  assert.equal(r.spec.adjusted, false);
  assert.equal(rangeLabel(r.spec), "2026.7.20 ~ 10.11 · 주 단위 12칸");
});

test("빠른 선택은 모두 그대로 뽑힌다 — 칸 수 상한 안", () => {
  for (const p of rangePresets(TODAY)) {
    const r = parseRange(p, TODAY);
    assert.ok(r.ok, `${p.label}: ${r.ok ? "" : r.error}`);
  }
  const byKey = Object.fromEntries(rangePresets(TODAY).map((p) => [p.key, p]));
  assert.deepEqual([byKey["last-month"].start, byKey["last-month"].end], ["20260901", "20260930"]);
  assert.deepEqual([byKey["6m"].start, byKey["6m"].end], ["20260401", "20260930"]);
  // 1월에 「최근 6개월」 — 해를 넘긴다
  const jan = Object.fromEntries(rangePresets("20270110").map((p) => [p.key, p]));
  assert.deepEqual([jan["6m"].start, jan["6m"].end], ["20260701", "20261231"]);
});

test("KST 오늘 — UTC 15시가 넘으면 다음 날", () => {
  assert.equal(kstToday(Date.parse("2026-10-14T14:59:00Z")), "20261014");
  assert.equal(kstToday(Date.parse("2026-10-14T15:00:00Z")), "20261015");
});
