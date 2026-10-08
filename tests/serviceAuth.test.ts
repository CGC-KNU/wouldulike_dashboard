import { test } from "node:test";
import assert from "node:assert/strict";
import { mintServiceToken, serviceToken, withServiceToken } from "../src/lib/draft/serviceAuth";
import { manualMissing } from "../src/lib/draft/reportManual";

/** 14일차 자동 초안(1007) — 서비스 토큰은 그 요청 안에서만 보이고, 손 입력 경고는 빈 항목을 정확히 짚는다. */

test("서비스 토큰은 withServiceToken 안에서만 보인다", async () => {
  assert.equal(serviceToken(), undefined);
  const seen = await withServiceToken("tok-a", async () => {
    await new Promise((r) => setTimeout(r, 5));
    return serviceToken();
  });
  assert.equal(seen, "tok-a");
  assert.equal(serviceToken(), undefined);
});

test("동시에 도는 두 요청의 토큰이 섞이지 않는다", async () => {
  const run = (t: string, ms: number) => withServiceToken(t, async () => { await new Promise((r) => setTimeout(r, ms)); return serviceToken(); });
  const [a, b] = await Promise.all([run("A", 20), run("B", 1)]);
  assert.deepEqual([a, b], ["A", "B"]);
});

test("mintServiceToken — 백엔드에 크론 토큰을 보여 주고 access 를 받는다", async () => {
  let sent: { url: string; token: string | null } | null = null;
  const f = (async (url: string, init?: RequestInit) => {
    sent = { url, token: new Headers(init?.headers).get("x-cron-token") };
    return new Response(JSON.stringify({ access: "jwt" }), { status: 200 });
  }) as unknown as typeof fetch;
  assert.equal(await mintServiceToken("https://be.test", "cron", f), "jwt");
  assert.deepEqual(sent, { url: "https://be.test/api/probe/auto-token/", token: "cron" });
});

test("mintServiceToken — 403·연결 실패·주소 없음은 null", async () => {
  const deny = (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch;
  const boom = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
  assert.equal(await mintServiceToken("https://be.test", "x", deny), null);
  assert.equal(await mintServiceToken("https://be.test", "x", boom), null);
  assert.equal(await mintServiceToken(undefined, "x"), null);
});

test("manualMissing — 캐러셀·큐레이션일 때만 그 항목을 묻고, 연령은 늘 묻는다", () => {
  assert.deepEqual(manualMissing(null, { carousel: true, curation: true }), ["썸네일 장 · 가게 장 좋아요 수", "18~24세 · 25~34세 비중", "함께 소개한 가게 수"]);
  assert.deepEqual(manualMissing(null, { carousel: false, curation: false }), ["18~24세 · 25~34세 비중"]);
  const full = { slide_likes: { thumb: 1, store: 2 }, age: { p18_24: 10, p25_34: 20 }, store_count: 3 };
  assert.deepEqual(manualMissing(full, { carousel: true, curation: true }), []);
});
