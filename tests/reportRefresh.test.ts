import { test } from "node:test";
import assert from "node:assert/strict";
import { isD7ReportToRefresh } from "../src/lib/draft/reportRefresh";

const rep = (age: number | null) => ({ snapshot: { age_days: age } }) as Parameters<typeof isD7ReportToRefresh>[0];

test("정든밤 · 다이와스시의 7일차 리포트는 14일차로 다시 낸다(1021)", () => {
  assert.equal(isD7ReportToRefresh(rep(7), "정든밤"), true);
  assert.equal(isD7ReportToRefresh(rep(8), "다이와 스시"), true);
});

test("14일차 이후 리포트나 다른 매장은 평소처럼 이미 있음", () => {
  assert.equal(isD7ReportToRefresh(rep(14), "정든밤"), false);
  assert.equal(isD7ReportToRefresh(rep(7), "라라더"), false);
  assert.equal(isD7ReportToRefresh(rep(null), "정든밤"), false);
});
