import { test } from "node:test";
import assert from "node:assert/strict";
import { campusOfMetric, summarizeStoreMetrics, withoutTestStores } from "../src/lib/draft/storeMetrics";
import type { StoreMetric } from "../src/lib/draft/types";

/** 매장 지표 합계 — 서버(/api/probe/overview)와 캠퍼스로 좁힌 화면이 같은 함수로 센다. */

const store = (id: number, o: Partial<StoreMetric> = {}): StoreMetric => ({
  restaurant_id: id, name: `매장${id}`, tier: null, is_affiliate: true,
  revisit_this_month: 0, loyal_total: 0, coupon_redeemed_this_month: 0, stamp_earned_this_month: 0,
  ...o,
});

const stores = [
  store(1, { campus: "경북대", tier: "BOOST", coupon_redeemed_this_month: 3 }),
  store(2, { campus: null }), // 캠퍼스 안 적음 → 경북대, 조용함
  store(3, { campus: "영남대", tier: "CONTENT", stamp_earned_this_month: 2 }),
  store(4, { campus: "영남대", unavailable: true }), // 못 읽음 — 조용한 매장이 아니다
  store(5, { campus: "계명대", is_affiliate: false }), // 비제휴 — 제휴 수·조용한 매장에서 빠진다
];

test("캠퍼스를 안 적은 매장은 경북대로 센다", () => {
  assert.equal(campusOfMetric({ campus: null }), "경북대");
  assert.equal(campusOfMetric({}), "경북대");
  assert.equal(campusOfMetric({ campus: "계명대" }), "계명대");
});

test("전체 합계 — 유료+무료=제휴, 못 읽은 매장은 조용한 매장이 아니다", () => {
  const t = summarizeStoreMetrics(stores);
  assert.equal(t.affiliate, 4);
  assert.equal(t.paid + t.free, t.affiliate);
  assert.equal(t.paid, 2);
  assert.equal(t.silent, 1);
  assert.equal(t.unavailable, 1);
  assert.equal(t.coupon_redeemed, 3);
  assert.equal(t.stamp_earned, 2);
});

test("캠퍼스별 합계를 더하면 전체와 같다", () => {
  const all = summarizeStoreMetrics(stores);
  const by = ["경북대", "영남대", "계명대"].map((c) => summarizeStoreMetrics(stores.filter((s) => campusOfMetric(s) === c)));
  for (const k of ["affiliate", "paid", "free", "silent", "unavailable", "coupon_redeemed", "stamp_earned"] as const) {
    assert.equal(by.reduce((a, t) => a + t[k], 0), all[k], k);
  }
  assert.deepEqual(by.map((t) => t.affiliate), [2, 2, 0]);
});

test("테스트 매장은 뺀다 — Astro 파트너 매장과 같은 기준", () => {
  const ops = [{ id: 2, is_test: true }, { id: 3, is_test: false }, { id: 99, is_test: true }];
  const { rows, excluded } = withoutTestStores(stores, ops);
  assert.deepEqual(rows.map((s) => s.restaurant_id), [1, 3, 4, 5]);
  assert.equal(excluded, 1, "목록에 없는 테스트 매장(99)은 세지 않는다");
  assert.equal(withoutTestStores(stores, []).excluded, 0, "운영 행이 없으면 아무것도 안 뺀다");
});
