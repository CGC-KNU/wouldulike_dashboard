import { test } from "node:test";
import assert from "node:assert/strict";
import { planLabel, planTextClass } from "../src/lib/draft/types";

/** 요금제 이름 · 색 — Astro 매장 목록 기준(1009). Probe 가 거꾸로 보이던 것. */

test("이름은 Astro 매장 목록과 같다", () => {
  assert.deepEqual(["BOOST", "CONTENT", "FREE", null].map(planLabel), ["Boost", "Premium", "무료", "미지정"]);
});

test("색도 Astro 매장 목록과 같다 — Boost 남색 · Premium 주황", () => {
  assert.equal(planTextClass("BOOST"), "text-navy");
  assert.equal(planTextClass("CONTENT"), "text-amber-700");
  assert.equal(planTextClass(null), "text-gray-400");
});
