import { test } from "node:test";
import assert from "node:assert/strict";
import { isPartnerPost, matchPlanStores } from "../src/lib/draft/partnerMatch";
import type { BackendRestaurant } from "../src/lib/draft/types";

/** 제휴 매장 게시물인가 — 매장 리포트 목록과 인스타 추이(1123)가 같은 규칙을 쓴다. */

const store = (restaurant_id: number, name: string) => ({ restaurant_id, name, is_affiliate: true }) as unknown as BackendRestaurant;
const STORES = [store(317, "라라더"), store(146, "닭동가리 경북대점"), store(10, "핵밥")];
const SPONSORS = [{ store_name: "교동후추" }];

test("괄호 표시 「(… 포함)」 — 매장 표에 없어도 제휴(매장 미확인)", () => {
  assert.deepEqual(matchPlanStores("대구 면 요리 맛집 (라라더 포함)", STORES, SPONSORS).map((m) => [m.r?.restaurant_id ?? null, m.by]), [[317, "marker"]]);
  assert.deepEqual(matchPlanStores("가을 맛집 (없는집 포함)", STORES, SPONSORS).map((m) => [m.r, m.label, m.by]), [[null, "없는집", "marker"]]);
  assert.equal(isPartnerPost("가을 맛집 (제휴식당 포함)", STORES, SPONSORS), true, "이름이 없어도 제휴식당 콘텐츠다");
});

test("표시가 없어도 제목에 앱 매장 이름이 들어가면 제휴(민찬 1123)", () => {
  assert.deepEqual(matchPlanStores("닭동가리 신메뉴 소개", STORES, SPONSORS).map((m) => [m.r?.restaurant_id, m.by]), [[146, "name"]]);
});

test("협찬 — 협찬 기록 이름이나 「<매장> 협찬」 꼴", () => {
  assert.deepEqual(matchPlanStores("교동후추 릴스", STORES, SPONSORS).map((m) => [m.r, m.label, m.by]), [[null, "교동후추", "sponsor"]]);
  assert.deepEqual(matchPlanStores("새집 협찬", STORES, SPONSORS).map((m) => m.label), ["새집"]);
});

test("묶음 제목은 정해 둔 매장 전부", () => {
  const m = matchPlanStores("한정쿠폰 주 매장 쿠폰 혜택", STORES, SPONSORS);
  assert.ok(m.some((x) => x.r?.restaurant_id === 317) && m.some((x) => x.r === null && x.label === "혜화문식당"));
});

test("일반 큐레이션 · 기획 없는 게시물은 제휴 아님", () => {
  assert.equal(isPartnerPost("대구 대학가 가성비 맛집", STORES, SPONSORS), false);
  assert.equal(isPartnerPost("", STORES, SPONSORS), false);
  assert.equal(isPartnerPost(null, STORES, SPONSORS), false);
});
