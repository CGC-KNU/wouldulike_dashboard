import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, PATCH } from "../src/app/api/app/owner/[...operation]/route";
import { middleware } from "../src/middleware";

test("middleware bypasses web cookies only for registered owner method/path pairs", () => {
  const next = middleware(new NextRequest("https://app.wouldulike.kr/api/app/owner/home", { headers: { Authorization: "Bearer app" } }));
  assert.equal(next.headers.get("x-middleware-next"), "1");
  assert.equal(middleware(new NextRequest("https://app.wouldulike.kr/api/app/owner/stamp-rule", { method: "PATCH" })).status, 405);
  assert.equal(middleware(new NextRequest("https://app.wouldulike.kr/api/app/owner/admin")).status, 404);
  for (const path of ["constructor", "toString", "__proto__"]) {
    const response = middleware(new NextRequest(`https://app.wouldulike.kr/api/app/owner/${path}`));
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(middleware(new NextRequest("https://app.wouldulike.kr/api/dashboard/admin/me")).status, 307);
});
test("owner route requires Bearer, returns JSON and private no-store without cookies", async () => {
  const res = await GET(new Request("https://app.wouldulike.kr/api/app/owner/config", { headers: { Cookie: "access_token=admin" } }));
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, "app_auth_required");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(res.headers.get("set-cookie"), null);
  assert.equal(res.headers.get("location"), null);
});
test("unsupported write fields are rejected before exchange or business calls", async () => {
  const res = await PATCH(new Request("https://app.wouldulike.kr/api/app/owner/restaurant?restaurant_id=1", {
    method: "PATCH", body: JSON.stringify({ campus: "KNU" }), headers: { Authorization: "Bearer app" },
  }));
  assert.equal(res.status, 400);
});
test("config authenticates while disabled, business requests fail closed, HTML stays an error", async () => {
  const oldFetch = globalThis.fetch;
  const oldBase = process.env.NEXT_PUBLIC_API_URL;
  const oldEnabled = process.env.APP_OWNER_MODE_ENABLED;
  process.env.NEXT_PUBLIC_API_URL = "https://backend.test";
  delete process.env.APP_OWNER_MODE_ENABLED;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return Response.json({ is_owner: true, restaurant_id: 1, access: "owner-only", refresh: "secret-refresh" });
  }) as typeof fetch;
  const req = (path: string) => new Request(`https://app.wouldulike.kr/api/app/owner/${path}`, { headers: { Authorization: "Bearer app" } });
  try {
    const config = await GET(req("config"));
    assert.deepEqual(await config.json(), { enabled: false });
    assert.equal(config.headers.get("set-cookie"), null);
    const home = await GET(req("home?restaurant_id=1"));
    assert.equal(home.status, 503);
    assert.equal((await home.json()).code, "owner_mode_disabled");
    assert.equal(calls, 2);
    globalThis.fetch = (async () => new Response("<html>bad gateway</html>", { status: 200 })) as typeof fetch;
    assert.equal((await GET(req("config"))).status, 502);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldBase === undefined) delete process.env.NEXT_PUBLIC_API_URL; else process.env.NEXT_PUBLIC_API_URL = oldBase;
    if (oldEnabled === undefined) delete process.env.APP_OWNER_MODE_ENABLED; else process.env.APP_OWNER_MODE_ENABLED = oldEnabled;
  }
});
