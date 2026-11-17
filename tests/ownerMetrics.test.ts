import { test } from "node:test";
import assert from "node:assert/strict";
import { readOwnerStoreViews } from "../src/lib/bigquery/ownerStoreViews";
import { attachStoreViews, type HomeMetrics } from "../src/lib/owner/homeMetrics";
import type { Client } from "../src/lib/bigquery/appMetrics";

const opts = { restaurantId: 7, month: "2026-11", since: "2026-04-01", today: "2026-11-12" };
test("owner view query filters one authenticated store, counts opens, marks partial lifetime", async () => {
  const calls: { sql: string; params?: Record<string, string> }[] = [];
  const client: Client = { dataset: "test.dataset", run: async <T>(sql: string, params?: Record<string, string>) => {
    calls.push({ sql, params });
    return (params ? [{ month: 12, total: 80 }] : [{ first: "events_20260301", last: "events_20261110" }]) as T[];
  } };
  const actual = await readOwnerStoreViews(opts, client);
  assert.deepEqual(actual, { month: 12, total: 80, month_status: "ok", total_status: "partial", through: "2026-11-10", available_from: "2026-05-05" });
  assert.equal(calls[1].params?.rid, "7");
  assert.equal(calls[1].params?.start, "20260505");
  assert.match(calls[1].sql, /COUNTIF/);
  assert.doesNotMatch(calls[1].sql, /COUNT\(DISTINCT/);
});
test("new month with no final table stays pending while existing lifetime remains available", async () => {
  const client: Client = { dataset: "test.dataset", run: async <T>(_: string, params?: Record<string, string>) =>
    (params ? [{ month: 0, total: 3 }] : [{ first: "events_20260505", last: "events_20261031" }]) as T[] };
  const actual = await readOwnerStoreViews(opts, client);
  assert.equal(actual.month, null);
  assert.equal(actual.month_status, "pending");
  assert.equal(actual.total, 3);
});
test("unknown entry date and missing credentials never become zero", async () => {
  const missing = await readOwnerStoreViews(opts, null);
  assert.equal(missing.month, null);
  const client: Client = { dataset: "test.dataset", run: async <T>(_: string, params?: Record<string, string>) =>
    (params ? [{ month: 0, total: 0 }] : [{ first: "events_20260505", last: "events_20261110" }]) as T[] };
  const actual = await readOwnerStoreViews({ ...opts, since: null }, client);
  assert.equal(actual.month, 0);
  assert.equal(actual.total, null);
  assert.equal(actual.total_status, "unknown_start");
});
test("GA4 failure preserves other home metrics and does not mutate input", async () => {
  const metrics: HomeMetrics = { since: "2026-10-01", as_of: "2026-11-12", coupon_used: { month: 1, total: 2 }, stamp: { month: 3, total: 4, enabled: true } };
  const home = { store: { restaurant_id: 7 }, month: "2026-11", metrics };
  const actual = await attachStoreViews(home, async (rid) => { assert.equal(rid, 7); throw Error("BQ down"); });
  assert.deepEqual(actual.metrics.coupon_used, metrics.coupon_used);
  assert.equal(actual.metrics.store_views?.month, null);
  assert.equal(home.metrics.store_views, undefined);
});
test("invalid store and dates are rejected before querying", async () => {
  for (const changed of [{ restaurantId: 0 }, { month: "2026-13" }, { since: "2026-02-30" }])
    await assert.rejects(() => readOwnerStoreViews({ ...opts, ...changed }, null));
});
