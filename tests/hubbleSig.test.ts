import { test } from "node:test";
import assert from "node:assert/strict";
import { igEvent, igSponsor, sigCompare, sigParts, type Ig } from "../src/lib/hubble";

/** 허블 광고 흔적(1027) — sig 는 키마다 빠질 수 있고, 옛 데이터엔 아예 없다 */

const ig = (sig?: Ig["sig"]): Ig => ({ handle: "a", url: "https://instagram.com/a", kind: "비즈니스", checked: "2026-10-27", sig });

test("옛 데이터(sig 없음)는 아무것도 안 그리고 필터에 안 걸린다", () => {
  assert.deepEqual(sigParts(undefined), []);
  assert.deepEqual(sigParts({}), []);
  assert.equal(igSponsor({ ig: ig() }), false);
  assert.equal(igEvent({}), false);
});

test("있는 값만 한 줄로", () => {
  assert.deepEqual(sigParts({ sponsor: 2, sponsor_last: "2026-10-12", event: 1, recent30: 4, engage: 37 }),
    ["협찬 · 체험단 흔적 2편 (최근 10/12)", "이벤트 1편", "최근 30일 4편", "반응 중앙값 37"]);
  assert.deepEqual(sigParts({ sponsor: 0, event: 0, engage: 12.6 }), ["협찬 · 체험단 흔적 없음", "반응 중앙값 13"]);
  assert.deepEqual(sigParts({ sponsor: 1, sponsor_last: null }), ["협찬 · 체험단 흔적 1편"]);
});

test("광고 흔적순 — 협찬 많은 순, 같으면 반응 높은 순, sig 없는 곳은 뒤", () => {
  const rows = [{ ig: ig() }, { ig: ig({ sponsor: 1, engage: 10 }) }, { ig: ig({ sponsor: 1, engage: 50 }) }, { ig: ig({ sponsor: 3 }) }];
  assert.deepEqual([...rows].sort(sigCompare).map((r) => [r.ig.sig?.sponsor, r.ig.sig?.engage]), [[3, undefined], [1, 50], [1, 10], [undefined, undefined]]);
  assert.equal(igSponsor(rows[1]), true);
});
