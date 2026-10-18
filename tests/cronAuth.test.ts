import { test } from "node:test";
import assert from "node:assert/strict";
import { backendWithCronToken, checkCronToken, plausibleCronToken } from "../src/lib/draft/cronAuth";

/**
 * PROBE 보고서 크론의 토큰 판정 — 대시보드는 비밀 값을 들고 있지 않고 백엔드에 묻는다(0928).
 * 백엔드 응답을 가짜 fetch 로 흉내 낸다.
 */

type Call = { url: string; token: string | null };
function fakeFetch(respond: (url: string) => { status: number; body?: unknown } | Error) {
  const calls: Call[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, token: new Headers(init?.headers).get("X-CRON-TOKEN") });
    const r = respond(url);
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const BASE = "https://backend.example";

test("백엔드가 200 이면 연다 — 받은 토큰을 그대로 보여 준다", async () => {
  const f = fakeFetch(() => ({ status: 200 }));
  assert.equal(await checkCronToken(BASE, "tok", "2026-09-28", f.impl), "ok");
  assert.equal(f.calls[0].token, "tok");
  assert.equal(f.calls[0].url, `${BASE}/api/dashboard/admin/app-stats/period/?start=2026-09-28&end=2026-09-28`);
});

test("백엔드가 403 이면 막고, 안 닿거나 5xx 면 「확인 못 함」으로 가른다", async () => {
  assert.equal(await checkCronToken(BASE, "tok", "2026-09-28", fakeFetch(() => ({ status: 403 })).impl), "denied");
  assert.equal(await checkCronToken(BASE, "tok", "2026-09-28", fakeFetch(() => ({ status: 401 })).impl), "denied");
  assert.equal(await checkCronToken(BASE, "tok", "2026-09-28", fakeFetch(() => ({ status: 502 })).impl), "unreachable");
  assert.equal(await checkCronToken(BASE, "tok", "2026-09-28", fakeFetch(() => new Error("ECONNRESET")).impl), "unreachable");
  assert.equal(await checkCronToken(undefined, "tok", "2026-09-28", fakeFetch(() => ({ status: 200 })).impl), "unreachable");
});

test("빈 값·지나치게 긴 값은 백엔드에 묻지도 않는다", () => {
  assert.equal(plausibleCronToken(null), false);
  assert.equal(plausibleCronToken(""), false);
  assert.equal(plausibleCronToken("x".repeat(513)), false);
  assert.equal(plausibleCronToken("abc"), true);
});

test("보고서 빌더용 fetch 는 같은 토큰으로 읽고, 실패는 null 이다(0 이 아니다)", async () => {
  const f = fakeFetch((url) => (url.includes("/ok/") ? { status: 200, body: { stats: { a: 1 } } } : { status: 403 }));
  const get = backendWithCronToken(BASE, "tok", f.impl);
  assert.deepEqual(await get("/api/ok/", "x=1"), { stats: { a: 1 } });
  assert.equal(await get("/api/no/"), null);
  assert.ok(f.calls.every((c) => c.token === "tok"));
  assert.equal(f.calls[0].url, `${BASE}/api/ok/?x=1`);
});

test("Koyeb 「almost ready」 503 은 기다렸다 다시 묻고, 앱이 낸 503 은 그대로 「확인 못 함」이다(1018)", async () => {
  let n = 0;
  const waking = fakeFetch(() => (++n === 1 ? { status: 503, body: "Your service is almost ready!" } : { status: 200 }));
  assert.equal(await checkCronToken(BASE, "tok", "2026-10-18", waking.impl), "ok");
  assert.equal(waking.calls.length, 2);
  assert.equal(waking.calls[1].token, "tok", "다시 보낼 때도 같은 토큰");

  const app503 = fakeFetch(() => ({ status: 503, body: { detail: "db down" } }));
  assert.equal(await checkCronToken(BASE, "tok", "2026-10-18", app503.impl), "unreachable");
  assert.equal(app503.calls.length, 1);
});
