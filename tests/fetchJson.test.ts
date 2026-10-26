import test from "node:test";
import assert from "node:assert/strict";
import { fetchJson, rememberJson } from "../src/app/dashboard/admin/_shared/fetchJson";

/**
 * 매장 리포트는 만든 뒤 `?fresh=1` 로 다시 읽고, 그 값을 `/api/probe/insights` 의 기억으로도 둔다(1027).
 * 안 그러면 30초 안에 탭을 옮겼다 오면 만들기 전 값을 받아 「만들기」가 다시 보인다.
 */
test("rememberJson 으로 둔 값은 다시 부르지 않고 그 값을 준다 · 못 읽은 값(null)은 두지 않는다", async () => {
  let calls = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => { calls++; return new Response('{"v":"old"}', { status: 200 }); }) as typeof fetch;
  try {
    rememberJson("/t/a", { v: "new" });
    assert.deepEqual(await fetchJson("/t/a"), { v: "new" });
    assert.equal(calls, 0);
    rememberJson("/t/b", null);
    assert.deepEqual(await fetchJson("/t/b"), { v: "old" });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = orig;
  }
});
