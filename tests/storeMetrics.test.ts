import { test } from "node:test";
import assert from "node:assert/strict";
import { campusOfMetric, failReasonLabel, isFailing, isSilent, summarizeActivity, summarizeStoreMetrics, withoutTestStores } from "../src/lib/draft/storeMetrics";
import type { StoreActivity, StoreMetric } from "../src/lib/draft/types";

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
  store(6, { campus: "계명대", hidden_from_app: true }), // 앱에서 숨김 — 제휴 수엔 남고 조용한 매장에선 빠진다
];

test("캠퍼스를 안 적은 매장은 경북대로 센다", () => {
  assert.equal(campusOfMetric({ campus: null }), "경북대");
  assert.equal(campusOfMetric({}), "경북대");
  assert.equal(campusOfMetric({ campus: "계명대" }), "계명대");
});

test("전체 합계 — 유료+무료=제휴, 못 읽은 매장·숨긴 매장은 조용한 매장이 아니다", () => {
  const t = summarizeStoreMetrics(stores);
  assert.equal(t.affiliate, 5);
  assert.equal(t.paid + t.free, t.affiliate);
  assert.equal(t.paid, 2);
  assert.equal(t.silent, 1);
  assert.equal(t.hidden, 1);
  assert.equal(t.unavailable, 1);
  assert.equal(t.coupon_redeemed, 3);
  assert.equal(t.stamp_earned, 2);
});

test("캠퍼스별 합계를 더하면 전체와 같다", () => {
  const all = summarizeStoreMetrics(stores);
  const by = ["경북대", "영남대", "계명대"].map((c) => summarizeStoreMetrics(stores.filter((s) => campusOfMetric(s) === c)));
  for (const k of ["affiliate", "paid", "free", "silent", "hidden", "unavailable", "coupon_redeemed", "stamp_earned"] as const) {
    assert.equal(by.reduce((a, t) => a + t[k], 0), all[k], k);
  }
  assert.deepEqual(by.map((t) => t.affiliate), [2, 2, 1]);
});

test("앱에서 숨긴 매장은 활동이 0 이어도 조용하지 않다 — 숨김을 풀면 다시 조용한 매장이다", () => {
  const hidden = store(7, { hidden_from_app: true });
  assert.equal(isSilent(hidden), false);
  assert.equal(isSilent({ ...hidden, hidden_from_app: false }), true);
  assert.equal(isSilent(store(8)), true, "값이 없으면(옛 응답) 보이는 매장으로 본다");
});

test("테스트 매장은 뺀다 — Astro 파트너 매장과 같은 기준", () => {
  const ops = [{ id: 2, is_test: true }, { id: 3, is_test: false }, { id: 99, is_test: true }];
  const { rows, excluded } = withoutTestStores(stores, ops);
  assert.deepEqual(rows.map((s) => s.restaurant_id), [1, 3, 4, 5, 6]);
  assert.equal(excluded, 1, "목록에 없는 테스트 매장(99)은 세지 않는다");
  assert.equal(withoutTestStores(stores, []).excluded, 0, "운영 행이 없으면 아무것도 안 뺀다");
});

const act = (o: Partial<StoreActivity> = {}): StoreActivity => ({
  detail_devices: 0, failed_devices: 0, coupon_failed: 0, coupon_unresolved: 0, stamp_failed: 0, reasons: [], ...o,
});

test("GA4 칸 — 조용한 매장을 안 보임·보고 안 씀으로 가르고, 실패 매장과 아직 못 쓴 쿠폰을 센다", () => {
  const list = [
    store(11), // 조용함 · GA4 에 줄이 없다(성공한 조회라 0) → 안 보임
    store(12), // 조용함 · 열어 본 기기가 있다 → 보고 안 씀
    store(13, { coupon_redeemed_this_month: 2 }), // 쓰이는 매장인데 실패도 났다 — 조용함과 따로 센다
    store(14, { hidden_from_app: true }), // 숨김 — 조용함이 아니라 안 보임에도 안 들어간다
    store(15, { is_affiliate: false }), // 비제휴 — 실패가 있어도 안 센다
  ];
  const a = {
    "12": act({ detail_devices: 4 }),
    "13": act({ detail_devices: 9, failed_devices: 2, coupon_failed: 3, coupon_unresolved: 1 }),
    "15": act({ failed_devices: 1, coupon_unresolved: 5 }),
  };
  assert.deepEqual(summarizeActivity(list, a), { unseen: 1, seen_unused: 1, failing: 1, coupon_unresolved: 1 });
  assert.equal(isFailing(list[2], a["13"]), true);
  assert.equal(isFailing(list[0], undefined), false);
  assert.equal(isFailing(list[4], a["15"]), false);
});

test("GA4 를 못 읽으면 전부 모름(null) — 0 으로 채우면 조용한 매장이 전부 「안 보임」이 된다", () => {
  assert.deepEqual(summarizeActivity([store(1)], null), { unseen: null, seen_unused: null, failing: null, coupon_unresolved: null });
});

test("실패 이유는 화면 말로 바꾸고, 모르는 값은 그대로 보인다", () => {
  assert.equal(failReasonLabel("invalid_pin"), "PIN 불일치");
  assert.equal(failReasonLabel("http_403"), "PIN 등(403)");
  assert.equal(failReasonLabel("brand_new_reason"), "brand_new_reason");
});
