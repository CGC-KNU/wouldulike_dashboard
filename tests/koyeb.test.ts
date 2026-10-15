import test from "node:test";
import assert from "node:assert/strict";
import { koyebFetch, isKoyebWaking, KOYEB_TRIES } from "../src/lib/draft/koyeb";

/**
 * 잠든 Koyeb 지역의 「almost ready」 503 만 다시 보낸다(1015).
 * 1015 `/r/store` 가 로그인 확인에서 이 503 을 받아 「로그인이 필요합니다」를 띄웠다 — guard.ts 가 이 함수를 거친다.
 */

const WAKING = "<html><body>Your service is almost ready!</body></html>";

/** 정해 둔 응답을 차례로 돌려주는 가짜 fetch */
function fake(...replies: [number, string][]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const [status, body] = replies[Math.min(calls.length - 1, replies.length - 1)];
    return new Response(body, { status, headers: { "X-Test": String(calls.length) } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

test("깨우는 중 503 은 기다렸다 다시 — 깬 쪽에 닿으면 그 답을 준다", async () => {
  const f = fake([503, WAKING], [503, WAKING], [200, '{"is_admin":true}']);
  const res = await koyebFetch("https://b/api/dashboard/admin/me/", { headers: { Authorization: "Bearer t" } }, { waitMs: 0, fetchFn: f.fn });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { is_admin: true });
  assert.equal(f.calls.length, 3);
  assert.deepEqual(f.calls[2].init, { headers: { Authorization: "Bearer t" } }, "다시 보낼 때도 같은 헤더");
});

test("앱이 낸 503 은 다시 보내지 않고, 본문을 그대로 읽을 수 있게 돌려준다", async () => {
  const f = fake([503, '{"detail":"점검 중"}']);
  const res = await koyebFetch("https://b/x", undefined, { waitMs: 0, fetchFn: f.fn });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { detail: "점검 중" }, "판정하느라 읽은 본문을 잃지 않는다");
  assert.equal(res.headers.get("X-Test"), "1");
  assert.equal(f.calls.length, 1);
});

test("끝까지 잠들어 있으면 정해 둔 횟수만 — 마지막 503 을 그대로 준다", async () => {
  const f = fake([503, WAKING]);
  const res = await koyebFetch("https://b/x", undefined, { waitMs: 0, fetchFn: f.fn });
  assert.equal(res.status, 503);
  assert.equal(f.calls.length, KOYEB_TRIES);
  assert.ok(isKoyebWaking(503, await res.text()));
});

test("401·200 같은 백엔드의 답은 한 번에", async () => {
  for (const status of [200, 401, 403, 404, 500]) {
    const f = fake([status, "{}"]);
    const res = await koyebFetch("https://b/x", undefined, { waitMs: 0, fetchFn: f.fn });
    assert.equal(res.status, status);
    assert.equal(f.calls.length, 1, `${status} 는 다시 보내지 않는다`);
  }
});

test("깨우는 중 판정은 503 + 「almost ready」 둘 다", () => {
  assert.equal(isKoyebWaking(503, WAKING), true);
  assert.equal(isKoyebWaking(502, WAKING), false);
  assert.equal(isKoyebWaking(503, '{"detail":"x"}'), false);
});
