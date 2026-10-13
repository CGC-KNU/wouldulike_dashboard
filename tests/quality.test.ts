import { test } from "node:test";
import assert from "node:assert/strict";
import { checkQuality, type Benefit, type QualityInput } from "../src/lib/draft/quality";
import { seedStoreOps } from "../src/lib/draft/seed";
import type { BackendRestaurant, Lead, StoreOps } from "../src/lib/draft/types";

/** 데이터 정합성 규칙 — /api/probe/quality 가 읽어 온 것으로 판정한다. */

const NOW = Date.parse("2026-10-13T03:00:00Z");
const store = (id: number, o: Partial<BackendRestaurant> = {}): BackendRestaurant => ({
  restaurant_id: id, name: `매장${id}`, tier: "FREE", is_affiliate: true, hidden_from_app: false, campus: "경북대", ...o,
});
const benefit = (restaurant_id: number): Benefit => ({ id: restaurant_id, restaurant_id, kind: "coupon", active: true, title: "쿠폰" });
const ops = (id: number, o: Partial<StoreOps> = {}): StoreOps => ({ ...seedStoreOps()[0], id, campus: "경북대", billing: "PAID", kit_delivered: true, semester_active: true, vacation_active: false, is_test: false, ...o });
const lead = (id: number, stage: Lead["stage"], last: string | null): Lead => ({ id, name: `후보${id}`, stage, last_touch_at: last }) as unknown as Lead;
const run = (o: Partial<QualityInput>) => checkQuality({ restaurants: [], benefits: [], featured: [], ops: [], leads: [], now: NOW, ...o });
const rules = (r: ReturnType<typeof checkQuality>) => r.issues.map((i) => i.rule).sort();

test("운영 기록을 못 읽으면(null) 입금·비치물·학기 규칙은 침묵한다 — 시드로 대신 판정하지 않는다", () => {
  const r = run({ restaurants: [store(1, { tier: "BOOST" })], benefits: [benefit(1)], ops: null });
  assert.deepEqual(rules(r), []);
});

test("백엔드 운영 기록으로 판정한다 — 입금 끝난 유료 매장은 아무것도 안 뜬다", () => {
  const r = run({ restaurants: [store(1, { tier: "BOOST" })], benefits: [benefit(1)], ops: [ops(1)] });
  assert.deepEqual(rules(r), []);
});

test("운영 기록이 있는데 그 매장 행이 없으면 OPS_ROW_MISSING, 계산서 무응답이면 높음", () => {
  const r = run({
    restaurants: [store(1, { tier: "BOOST" }), store(2, { tier: "CONTENT" })],
    benefits: [benefit(1), benefit(2)],
    ops: [ops(2, { billing: "PENDING", invoice: "NO_REPLY" })],
  });
  assert.deepEqual(rules(r), ["OPS_ROW_MISSING", "PAID_TIER_UNSETTLED"]);
  assert.equal(r.issues.find((i) => i.rule === "PAID_TIER_UNSETTLED")!.severity, "high");
});

test("앱 대학가가 빈 제휴 매장은 높음 — Astro 에 캠퍼스가 있으면 그 값을 적는다", () => {
  const r = run({ restaurants: [store(1, { campus: "" }), store(2, { campus: "  " })], benefits: [benefit(1), benefit(2)], ops: [ops(1, { campus: "영남대" })] });
  assert.deepEqual(rules(r), ["APP_CAMPUS_MISSING", "APP_CAMPUS_MISSING"]);
  assert.ok(r.issues.every((i) => i.severity === "high"));
  assert.match(r.issues.find((i) => i.subject === "매장1")!.detail, /영남대/);
  assert.match(r.issues.find((i) => i.subject === "매장1")!.hint, /sync_store_campus/);
});

test("앱 대학가 규칙은 비제휴·앱에서 숨긴 매장·campus 칸이 없는 옛 응답에는 안 뜬다", () => {
  const r = run({
    restaurants: [store(1, { campus: "", is_affiliate: false }), store(2, { campus: "", hidden_from_app: true }), store(3, { campus: undefined })],
    ops: [],
  });
  assert.deepEqual(rules(r), []);
});

test("Astro 캠퍼스와 앱 대학가가 다르면 보통, 한쪽이 비면 이 규칙은 안 뜬다", () => {
  const r = run({
    restaurants: [store(1, { campus: "계명대" }), store(2, { campus: "경북대" })],
    benefits: [benefit(1), benefit(2)],
    ops: [ops(1, { campus: "영남대" }), ops(2, { campus: null })],
  });
  assert.deepEqual(rules(r), ["CAMPUS_MISMATCH"]);
  assert.equal(r.issues[0].severity, "medium");
});

test("테스트 매장은 점검에서 뺀다 — 매장 지표·Astro 와 같은 기준", () => {
  const r = run({ restaurants: [store(1, { campus: "" }), store(2, { tier: null })], ops: [ops(1, { is_test: true }), ops(2, { is_test: true })] });
  assert.deepEqual(rules(r), []);
  assert.equal(r.test_excluded, 2);
});

test("방치된 컨택 — 7일 보통 · 14일 높음, 거절·보류·계약 완료와 못 읽은 후보(null)는 뺀다", () => {
  const leads = [
    lead(1, "컨택 중", "2026-10-05T00:00:00Z"), // 8일
    lead(2, "미팅 조율", "2026-09-20T00:00:00Z"), // 23일
    lead(3, "거절", "2026-09-01T00:00:00Z"),
    lead(4, "컨택 중", "2026-10-10T00:00:00Z"), // 3일
  ];
  const r = run({ leads });
  assert.deepEqual(r.issues.map((i) => [i.subject, i.severity]), [["후보2", "high"], ["후보1", "medium"]]);
  assert.deepEqual(rules(run({ leads: null })), []);
});

test("높음이 먼저, 개수는 심각도별로 센다", () => {
  const r = run({
    restaurants: [store(1, { tier: null }), store(2, { campus: "" })],
    benefits: [benefit(1), benefit(2)],
    ops: [],
  });
  assert.equal(r.issues[0].rule, "APP_CAMPUS_MISSING");
  assert.deepEqual(r.counts, { high: 1, medium: 1, low: 0 });
});
