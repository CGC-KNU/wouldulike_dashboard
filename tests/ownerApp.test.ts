import { test } from "node:test";
import assert from "node:assert/strict";
import { authenticateOwner, Backend, checkStore, OwnerError, ownerModeEnabled } from "../src/lib/owner/appAuth";
import { ownerRouteMethods } from "../src/lib/owner/routes";
import { invoiceVisible, reportStatus } from "../src/lib/owner/presentation";
import { openReport, ownerOperation } from "../src/lib/owner/operations";
import { submitBenefitRequest } from "../src/lib/owner/benefitRequests";

const request = (token = "app-a") => new Request("https://app.wouldulike.kr/api/app/owner/home?restaurant_id=1", { headers: { Authorization: `Bearer ${token}` } });
const ctx = { access: "owner-a", restaurantId: 1, signal: AbortSignal.timeout(25000) };
const result = (data: Record<string, unknown>, status = 200) => ({ data, status });
const token = "a".repeat(40);
const rejects = (fn: () => unknown, status: number, code?: string) => assert.rejects(async () => fn(), (e: unknown) => e instanceof OwnerError && e.status === status && (!code || e.code === code));

test("owner route registry accepts only exact paths and allowed methods", () => {
  assert.deepEqual(ownerRouteMethods("/api/app/owner/restaurant"), ["GET", "PATCH"]);
  assert.deepEqual(ownerRouteMethods("/api/app/owner/reports/abc-1/open"), ["GET"]);
  for (const p of ["/api/app/admin", "/api/app/owner/stamp-rule/", "/api/app/owner/coupon-benefits", "/api/app/owner/reports/1", "/api/app/owner/config/extra", "/api/app/owner/constructor", "/api/app/owner/toString", "/api/app/owner/__proto__"])
    assert.equal(ownerRouteMethods(p), undefined);
  assert.deepEqual(ownerRouteMethods("/api/app/owner/stamp-rule"), ["GET"]);
});
test("web cookies alone never authenticate the app", async () => {
  await rejects(() => authenticateOwner(new Request("https://app.wouldulike.kr", { headers: { Cookie: "access_token=admin" } }), 1, async () => { throw Error("must not call"); }), 401);
});
test("exchange sends app JWT and selected store only; refresh is discarded", async () => {
  let calls = 0;
  const call: Backend = async (path, init) => {
    calls++;
    assert.equal(path, "/api/dashboard/auth/app-token/");
    assert.deepEqual(JSON.parse(init!.body as string), { token: "app-a", restaurant_id: 1 });
    return result({ is_owner: true, restaurant_id: 1, access: "owner-a", refresh: "never-store" });
  };
  const actual = await authenticateOwner(request(), 1, call);
  assert.equal(actual.access, "owner-a");
  assert.equal("refresh" in actual, false);
  assert.equal(calls, 1);
});
test("store mismatch and forged owner flags cannot authorize business calls", async () => {
  await rejects(() => authenticateOwner(request(), 1, async () => result({ is_owner: true, restaurant_id: 2, access: "other" })), 409);
  await rejects(() => authenticateOwner(request(), 1, async () => result({ is_owner: false, restaurant_id: 1, access: "other" })), 502);
});
test("exchange 401 is normalized using existing me without decoding JWT", async () => {
  const run = (me: ReturnType<typeof result>) => authenticateOwner(request(), 1, async (p) => p.includes("app-token") ? result({}, 401) : me);
  await rejects(() => run(result({}, 401)), 401);
  await rejects(() => run(result({ is_partner: false, stores: [] })), 403);
  await rejects(() => run(result({ is_partner: true, stores: [{ restaurant_id: 2 }] })), 403);
  await rejects(() => run(result({}, 503)), 502);
});
test("concurrent accounts get isolated per-request owner tokens", async () => {
  const call: Backend = async (_, init) => {
    const d = JSON.parse(init!.body as string);
    await new Promise((r) => setTimeout(r, d.token === "A" ? 10 : 1));
    return result({ is_owner: true, restaurant_id: d.restaurant_id, access: `owner-${d.token}` });
  };
  const [a, b] = await Promise.all([authenticateOwner(request("A"), 1, call), authenticateOwner(request("B"), 2, call)]);
  assert.deepEqual([a.access, a.restaurantId, b.access, b.restaurantId], ["owner-A", 1, "owner-B", 2]);
});
test("nested business store mismatch stops response", () => {
  assert.throws(() => checkStore({ requests: [{ restaurant_id: 2 }] }, 1), OwnerError);
});
test("feature flag defaults closed and accepts only true/1", () => {
  const old = process.env.APP_OWNER_MODE_ENABLED;
  try {
    for (const value of [undefined, "", "false", "TRUE", "yes", "0"]) { if (value === undefined) delete process.env.APP_OWNER_MODE_ENABLED; else process.env.APP_OWNER_MODE_ENABLED = value; assert.equal(ownerModeEnabled(), false); }
    for (const value of ["true", "1"]) { process.env.APP_OWNER_MODE_ENABLED = value; assert.equal(ownerModeEnabled(), true); }
  } finally { if (old === undefined) delete process.env.APP_OWNER_MODE_ENABLED; else process.env.APP_OWNER_MODE_ENABLED = old; }
});
test("home strips private invoice amounts and distinguishes failed report lookup", async () => {
  const data = await ownerOperation(ctx, "home", "GET", undefined, async (p) => {
    if (p.includes("home")) return result({ store: { restaurant_id: 1, contract_days: 50 }, billing: { invoice: { total: 999, status: "DRAFT" } }, stats: {}, feed: [] });
    if (p.includes("reports")) throw new OwnerError(502, "upstream_unavailable", "down");
    return result({ poster_url: "https://example.test/poster" });
  }) as any;
  assert.equal(data.billing.invoice, null);
  assert.equal(JSON.stringify(data).includes("999"), false);
  assert.equal(data.report_status.state, "unavailable");
  assert.equal(data.report_status.available_count, null);
});
test("invoice publication and report timing match web rules", () => {
  assert.equal(invoiceVisible({ status: "DRAFT" }), false);
  assert.equal(invoiceVisible({ status: "ISSUING" }), true);
  assert.equal(invoiceVisible({ status: "DRAFT", paid_at: "2026-11-01" }), true);
  assert.deepEqual([reportStatus(null, 0).state, reportStatus(29, 2).state, reportStatus(30, 1).state, reportStatus(45, 0).state, reportStatus(46, 0).state], ["unknown_start", "collecting", "available", "preparing", "delayed"]);
});
test("restaurant field allowlist excludes campus/name/plan and caps photos", async () => {
  let calls = 0;
  const call: Backend = async () => { calls++; return result({ success: true }); };
  for (const body of [{ campus: "KNU" }, { name: "other" }, { tier: "CONTENT" }, { s3_image_urls: Array(6).fill("https://x.test/a") }])
    await rejects(() => ownerOperation(ctx, "restaurant", "PATCH", body, call), 400);
  assert.equal(calls, 0);
  await ownerOperation(ctx, "restaurant", "PATCH", { description: "hello" }, call);
  assert.equal(calls, 1);
});
test("presign forces restaurant upload and cannot target arbitrary bucket categories", async () => {
  let body: unknown;
  await ownerOperation(ctx, "images/presign", "POST", { filename: "photo.jpg", content_type: "image/jpeg" }, async (_, init) => { body = JSON.parse(init!.body as string); return result({}); });
  assert.deepEqual(body, { filename: "photo.jpg", content_type: "image/jpeg", restaurant_id: 1, upload_type: "restaurant" });
  await rejects(() => ownerOperation(ctx, "images/presign", "POST", { upload_type: "docs" }), 400);
});
test("reports use string IDs and minimum fields, omit snapshots and tokens", async () => {
  const data = await ownerOperation(ctx, "reports", "GET", undefined, async () => result({ reports: [{ id: "opaque-id", restaurant_id: 1, status: "LINKED", token, snapshot: { huge: true }, title: "Report" }] })) as any;
  assert.equal(data.reports[0].id, "opaque-id");
  assert.equal("token" in data.reports[0], false);
  assert.equal("snapshot" in data.reports[0], false);
});
test("report open validates ownership list then current public state", async () => {
  const row = { id: "opaque-id", restaurant_id: 1, status: "LINKED", token };
  const call: Backend = async (p) => result(p.includes("mine") ? { reports: [row] } : { report: row });
  assert.deepEqual(await openReport(ctx, "opaque-id", call), { url: `https://app.wouldulike.kr/r/${token}` });
  await rejects(() => openReport(ctx, "other-id", call), 404);
  await rejects(() => openReport(ctx, "opaque-id", async (p) => result(p.includes("mine") ? { reports: [row] } : { report: { id: "opaque-id", status: "REVOKED" } })), 404);
  await rejects(() => openReport(ctx, "opaque-id", async () => result({ reports: [{ ...row, restaurant_id: 2 }] })), 409);
});
test("benefit save is called once; no request means no notification", async () => {
  let count = 0;
  assert.deepEqual(await submitBenefitRequest({ action: "OTHER" }, async () => { count++; return { replaced: false }; }), { replaced: false });
  assert.equal(count, 1);
});
test("saved benefit request survives one failed Slack notification", async () => {
  let saves = 0, notifications = 0;
  const data = { request: { id: 1, restaurant_id: 1, store_name: "매장", action_label: "기타", benefit_label: "", before: "", after: "요청", note: "", applies_automatically: false } };
  assert.equal(await submitBenefitRequest({}, async () => { saves++; return data; }, async () => { notifications++; throw Error("Slack down"); }), data);
  assert.equal(saves, 1); assert.equal(notifications, 1);
});
test("stamp-rule absence is explicit; unimplemented/HTML errors never become empty rules", async () => {
  assert.deepEqual(await ownerOperation(ctx, "stamp-rule", "GET", undefined, async () => result({ exists: false }, 404)), { exists: false });
  await rejects(() => ownerOperation(ctx, "stamp-rule", "GET", undefined, async () => result({ detail: "Not found" }, 404)), 404);
});
