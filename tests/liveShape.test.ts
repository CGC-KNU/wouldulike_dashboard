import { test } from "node:test";
import assert from "node:assert/strict";
import { averageWeeks, hourKeys, kstIso, pickTables, windowDays } from "../src/lib/bigquery/liveShape";

/** Probe 실시간 지표 — 지금부터 24시간 창이 GA4 테이블 · 시간대 칸으로 바뀌는 규칙. 숫자는 지어낸 값이다. */

const at = (iso: string) => Date.parse(iso);
const NOW = at("2026-11-08T19:26:28+09:00");
const SINCE = NOW - 24 * 3_600_000;

test("창은 KST 날짜 둘에 걸친다 — 자정 직후면 하루 앞까지", () => {
  assert.deepEqual(windowDays(SINCE, NOW), ["20261107", "20261108"]);
  // 0시 정각에 끝나는 창은 그날을 읽지 않는다(반열린 구간)
  assert.deepEqual(windowDays(at("2026-11-07T00:00:00+09:00"), at("2026-11-08T00:00:00+09:00")), ["20261107"]);
  // 달 · 해 경계
  assert.deepEqual(windowDays(at("2026-12-31T10:00:00+09:00"), at("2027-01-01T10:00:00+09:00")), ["20261231", "20270101"]);
});

test("날짜마다 확정이 있으면 확정, 없으면 당일분 — 둘 다 읽지 않는다", () => {
  const existing = new Set(["events_20261107", "events_intraday_20261107", "events_intraday_20261108"]);
  assert.deepEqual(pickTables(["20261107", "20261108"], existing), [
    { date: "20261107", table: "final", id: "events_20261107" },
    { date: "20261108", table: "provisional", id: "events_intraday_20261108" },
  ]);
  assert.deepEqual(pickTables(["20261109"], existing), [{ date: "20261109", table: "missing", id: null }]);
});

test("시간대 칸은 KST 정시 — 첫 · 끝 칸은 반쪽이라 보통 25칸", () => {
  const keys = hourKeys(SINCE, NOW);
  assert.equal(keys.length, 25);
  assert.equal(keys[0], "2026-11-07T19");
  assert.equal(keys.at(-1), "2026-11-08T19");
  // 정시에 끝나는 창은 24칸
  assert.equal(hourKeys(at("2026-11-07T19:00:00+09:00"), at("2026-11-08T19:00:00+09:00")).length, 24);
});

test("kstIso 는 백엔드 since · until 과 같은 모양", () => {
  assert.equal(kstIso(NOW), "2026-11-08T19:26:28+09:00");
});

test("기준선 = 지난 4주 평균, 한 주라도 비면 null", () => {
  const week = (w: number, active: number) => ({ w, active, events: 10, new_devices: 1, sessions: 2, s0: w, f0: 0 });
  const base = averageWeeks([week(1, 3), week(2, 4), week(3, 6), week(4, 5)]);
  assert.ok(base);
  assert.equal(base.active, 4.5);
  assert.equal(base.steps.restaurant_detail_open, 2.5);
  assert.equal(base.failures.coupon_redeem_failed, 0);
  assert.equal(averageWeeks([week(1, 3), week(2, 4), week(4, 5)]), null);
  assert.equal(averageWeeks([week(1, 3), week(2, 4), { ...week(3, 0), events: 0 }, week(4, 5)]), null);
});
