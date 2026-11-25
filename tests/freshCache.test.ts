import test from "node:test";
import assert from "node:assert/strict";
import { freshOrStale } from "../src/lib/draft/freshCache";

/**
 * 만료된 캐시 값을 지금 값처럼 내주지 않는다(1125) — 「지금」 칸이 전날 밤 값, 웹 지표가 이틀 전 값으로 떴다.
 */

const NOW = 1_000_000_000_000;

test("기한 안이면 캐시 값 그대로 — 다시 읽지 않는다", async () => {
  let reads = 0;
  const v = await freshOrStale({ at: NOW - 30_000, data: "cached" }, async () => { reads++; return "new"; }, 60_000, NOW);
  assert.equal(v, "cached");
  assert.equal(reads, 0);
});

test("기한이 지났으면 기다려서 새로 읽는다", async () => {
  let reads = 0;
  const v = await freshOrStale({ at: NOW - 12 * 3600_000, data: "어젯밤" }, async () => { reads++; return "지금"; }, 60_000, NOW);
  assert.equal(v, "지금");
  assert.equal(reads, 1);
});

test("새로 읽기가 실패하면 옛 값이라도 낸다", async () => {
  const v = await freshOrStale({ at: NOW - 12 * 3600_000, data: "어젯밤" }, async () => { throw new Error("GA4 한도"); }, 60_000, NOW);
  assert.equal(v, "어젯밤");
});

test("읽은 시각이 없는 값(옛 모양)은 만료로 본다", async () => {
  const v = await freshOrStale({ at: undefined as unknown as number, data: "?" }, async () => "새 값", 60_000, NOW);
  assert.equal(v, "새 값");
});
