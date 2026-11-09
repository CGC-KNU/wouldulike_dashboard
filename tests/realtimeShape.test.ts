import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketLabel, bucketOf, nowRanges, shapeNow } from "../src/lib/ga4/realtimeShape";

/** Probe 실시간 「지금」 칸 — GA4 실시간 응답이 5분 칸 6개로 바뀌는 규칙. 숫자는 지어낸 값이다. */

const row = (dims: string[], mets: number[]) => ({ dimensionValues: dims.map((value) => ({ value })), metricValues: mets.map((m) => ({ value: String(m) })) });
const EMPTY = { rows: undefined };

test("5분 칸 6개 — 0번이 지금(0~4분 전), 마지막이 25~29분 전", () => {
  const r = nowRanges();
  assert.equal(r.length, 6);
  assert.deepEqual(r[0], { name: "b0", startMinutesAgo: 4, endMinutesAgo: 0 });
  assert.deepEqual(r[5], { name: "b5", startMinutesAgo: 29, endMinutesAgo: 25 });
  assert.equal(bucketLabel(0), "지금");
  assert.equal(bucketLabel(3), "15~19분 전");
});

test("minutesAgo → 칸: 경계는 5의 배수에서 넘어가고 30분 이상은 버린다", () => {
  assert.equal(bucketOf("00"), 0);
  assert.equal(bucketOf("04"), 0);
  assert.equal(bucketOf("05"), 1);
  assert.equal(bucketOf("29"), 5);
  assert.equal(bucketOf("30"), null);
  assert.equal(bucketOf(""), null);
});

test("사람 수는 칸마다 따로 받은 값 그대로 — 행이 없는 칸은 0", () => {
  const out = shapeNow({
    bucketUsers: [{ rows: [row(["b0"], [2]), row(["b1"], [1])] }, EMPTY, { rows: [row(["b5"], [3])] }],
    platform: { rows: [row(["iOS"], [2]), row(["Android"], [3]), row(["web"], [9])] },
    events: EMPTY,
    screens: EMPTY,
  }, "2026-11-09T01:00:00.000Z");
  assert.deepEqual(out.buckets.map((b) => b.users), [2, 1, 0, 0, 0, 3]);
  // 30분 전체는 칸 합(6)이 아니라 따로 센 값, 웹은 뺀다
  assert.deepEqual(out.total, { users: 5, ios: 2, android: 3 });
});

test("이벤트는 분 단위 건수를 칸으로 더한다 — 손으로 보낸 이벤트 먼저, 자동 이벤트는 아래", () => {
  const out = shapeNow({
    bucketUsers: [EMPTY, EMPTY, EMPTY],
    platform: EMPTY,
    events: { rows: [
      row(["00", "screen_view"], [10]),
      row(["01", "coupon_claim"], [1]),
      row(["03", "coupon_claim"], [2]),
      row(["07", "coupon_claim"], [1]),
      row(["12", "coupon_redeem_failed"], [1]),
      row(["31", "coupon_claim"], [99]), // 창 밖
    ] },
    screens: { rows: [row(["Home"], [2]), row(["Coupon"], [3]), row(["Zero"], [0])] },
  }, "2026-11-09T01:00:00.000Z");
  assert.deepEqual(out.events.map((e) => e.name), ["coupon_claim", "coupon_redeem_failed", "screen_view"]);
  assert.deepEqual(out.events[0].perBucket, [3, 1, 0, 0, 0, 0]);
  assert.equal(out.events[0].total, 4);
  assert.equal(out.events[2].auto, true);
  assert.deepEqual(out.buckets.map((b) => b.events), [13, 1, 1, 0, 0, 0]);
  assert.deepEqual(out.screens, [{ name: "Coupon", users: 3 }, { name: "Home", users: 2 }]);
});
