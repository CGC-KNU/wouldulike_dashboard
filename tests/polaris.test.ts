import { test } from "node:test";
import assert from "node:assert/strict";
import { growth, type PolarisInput } from "../src/lib/polaris";

/** 메인 Polaris 성장률의 WAU 줄 — 모르는 값은 0 이 아니고, 못 읽은 것은 「연결 전」이 아니다. */

const base = (app: PolarisInput["app"]): PolarisInput => ({
  stores: { total: 10, paid: 4, totalAgo: { week: 8 }, paidAgo: { week: 3 } },
  revenue: { paid: 0, billed: 0 },
  app,
  reach: {},
  coupon: {},
});
const wau = (app: PolarisInput["app"], period: "week" | "month" = "week") => growth(base(app), period).find((r) => r.key === "wau")!;

test("주 — 4주 전 WAU 와 견준다", () => {
  const r = wau({ wau: 150, wauAgo: 120 });
  assert.equal(r.now, 150);
  assert.equal(r.before, 120);
  assert.equal(r.pct, 25);
  assert.equal(r.note, undefined);
});

test("월 — 주 단위로만 비교한다", () => {
  const r = wau({ wau: 150, wauAgo: 120 }, "month");
  assert.equal(r.before, undefined);
  assert.equal(r.pct, null);
  assert.equal(r.note, "주 단위로만 비교");
});

test("4주 전 값이 없으면 증감률을 내지 않는다", () => {
  const r = wau({ wau: 150 });
  assert.equal(r.pct, null);
  assert.equal(r.note, "4주 전 값 없음");
});

test("읽는 중 · 못 읽음은 「연결 전」이라 하지 않는다", () => {
  assert.equal(wau({ state: "loading" }).note, "읽는 중");
  assert.equal(wau({ state: "failed" }).note, "읽지 못함");
  // 응답은 왔는데 GA4 만 비었다
  assert.equal(wau({ wauAgo: 120 }).note, "읽지 못함");
  assert.equal(wau({ wauAgo: 120 }).pct, null);
});

/** 인스타 도달 줄 — 백엔드가 Meta 계정 도달을 읽는다. WAU 와 같은 규칙(주 = 4주 전, 월은 견주지 않음). */
const reach = (r: PolarisInput["reach"], period: "week" | "month" = "week") =>
  growth({ ...base({}), reach: r }, period).find((x) => x.key === "reach")!;

test("인스타 도달 — 4주 전 7일과 견주고 센 날짜를 알려 준다", () => {
  const r = reach({ last7: 1200, ago: 1000, window: { from: "2026-10-06", to: "2026-10-12" } });
  assert.equal(r.pct, 20);
  assert.equal(r.note, undefined);
  assert.match(r.hint ?? "", /^10\/6~10\/12 /);
  assert.equal(reach({ last7: 1200, ago: 1000 }, "month").note, "주 단위로만 비교");
});

test("인스타 도달 — 읽는 중 · 못 읽음 · Meta 가 값을 안 줌은 「연결 전」이 아니다", () => {
  assert.equal(reach({ state: "loading" }).note, "읽는 중");
  assert.equal(reach({ state: "failed" }).note, "읽지 못함");
  assert.equal(reach({ ago: 1000 }).note, "읽지 못함");
  assert.equal(reach({ last7: 1200 }).note, "4주 전 값 없음");
  assert.equal(reach({ last7: 1200 }).pct, null);
});
