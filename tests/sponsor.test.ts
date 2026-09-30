import { test } from "node:test";
import assert from "node:assert/strict";
import { sponsorStores } from "../src/lib/draft/papillon";

/**
 * 앱 매장 표에 없는 협찬 매장(1001) — 「교동후추 협찬」 릴스가 Probe 에 안 떠서 만들었다.
 * 협찬 기록의 이름이 먼저, 없으면 「<매장> 협찬」 제목의 앞부분.
 */

test("협찬 기록에 있는 이름이 제목에 들어 있으면 그 이름", () => {
  const sps = [{ store_name: "교동후추 경대점" }, { store_name: "다른 가게" }];
  assert.deepEqual(sponsorStores("교동후추 협찬", sps), ["교동후추 경대점"]);
});

test("협찬 기록이 없으면 「<매장> 협찬」 제목에서 읽는다", () => {
  assert.deepEqual(sponsorStores("교동 서서 협찬", []), ["교동 서서"]);
  assert.deepEqual(sponsorStores("교동후추 협찬 ", [{ store_name: "라라더" }]), ["교동후추"]);
});

test("협찬 게시물이 아니면 비어 있다", () => {
  assert.deepEqual(sponsorStores("대구 돈가스 맛집", [{ store_name: "라라더" }]), []);
  assert.deepEqual(sponsorStores("큐레이션 콘텐츠(추석 연휴 관련)", []), []);
  assert.deepEqual(sponsorStores("협찬", []), []);
  assert.deepEqual(sponsorStores(null, []), []);
});
