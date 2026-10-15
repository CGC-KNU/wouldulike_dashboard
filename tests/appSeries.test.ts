import { test } from "node:test";
import assert from "node:assert/strict";
import type { Ga4AppMetrics } from "../src/lib/bigquery/appMetrics";
import type { CouponFunnel, CouponUseFunnel } from "../src/lib/bigquery/couponFunnel";
import { parseRange } from "../src/lib/draft/appRange";
import { buildSeries, seriesRow, type CellInput } from "../src/lib/draft/appSeriesData";
import { renderRawReport, seriesCsv } from "../src/lib/draft/appRawReport";

/** 앱 지표 기간 × 단위 표 — 칸마다 읽은 값을 지표 행으로(1015). 숫자는 지어낸 것이다. */

const TODAY = "20261015";

function ga4(over: Partial<Ga4AppMetrics> = {}): Ga4AppMetrics {
  return {
    through: "2026-10-13", week: { from: "2026-10-05", to: "2026-10-11" },
    wau: 100, new_devices: 20, dau: 25, dau_wau: 25, mau: 300,
    open_to_store: 10, sessions: 400, sessions_with_detail: 40, sessions_detail_to_coupon: 4,
    retention_w1: 12.5, cohort: { from: "2026-09-21", to: "2026-09-27", users: 40 },
    push_open: 5, push: { from: "2026-09-28", to: "2026-10-11", received: 200, opened_android: 10, opened_ios: 2 },
    banner_to_coupon: 10, banner: { from: "2026-09-07", to: "2026-10-04", clicked: 20, redeemed: 2 },
    banner_ctr: 0, banner_view: { seen: 0, clicked: 0 },
    ...over,
  };
}

function coupons(over: Partial<CouponFunnel> = {}): CouponFunnel {
  return {
    window: { from: "2026-10-05", to: "2026-10-11" },
    bySource: [],
    campaign: { issued: 0, redeemed: 0, rate: null },
    organic: { issued: 50, redeemed: 5, rate: 10 },
    wallet: { saw: 60, opened_use: 30, rate: 50 },
    attempt: { attempts: 10, ok: 8, failed: 2, reasons: [], rate: 80 },
    pinFailStores: [],
    coverage: { wallet_to_use: "full", redeem_outcome: "full" },
    ...over,
  };
}

const line = (issued: number, redeemed: number) => ({ issued, screen: issued, attempt: redeemed, redeemed, pin_failed: 0 });
function use(over: Partial<CouponUseFunnel> = {}): CouponUseFunnel {
  return { window: { from: "2026-10-05", to: "2026-10-11" }, followDays: 7, maturing: 0, organic: line(30, 3), campaign: line(0, 0), coverage: { steps: "full", failures: "full" }, ...over };
}

const db = (stats: Record<string, number | null>, failed: string[] = []) => ({ complete: true, stats, failed });
const full = (o: Partial<CellInput> = {}): CellInput => ({ ga4: ga4(), coupons: coupons(), s2c: { window: { from: "", to: "" }, views: 80, claimed: 4, claimed_including_campaign: 9, rate: 5 }, use: use(), db: db({ signups: 7, coupon_issued: 10, coupon_redeemed: 3, coupon_redeem_rate: 30, stamp_earned: 12 }), ...o });

function spec(unit: "day" | "week" | "month", start: string, end: string) {
  const r = parseRange({ start, end, unit }, TODAY);
  if (!r.ok) throw new Error(r.error);
  return r.spec;
}

test("주 단위 — 칸마다 같은 정의, 진행 중인 칸 표시", () => {
  const s = buildSeries({
    spec: spec("week", "2026-09-28", "2026-10-15"), through: "20261013", today: TODAY, generatedAt: "2026-10-15 12:00",
    cells: [full(), full(), full({ ga4: ga4({ wau: 50, new_devices: 5 }) })],
    total: full({ ga4: ga4({ wau: 180, new_devices: 40 }), db: db({ coupon_redeem_rate: 28 }) }),
  });
  assert.deepEqual(s.buckets.map((b) => b.open), [false, false, true]); // 10/12~18 은 확정 테이블(10/13)보다 늦게 끝난다
  const active = seriesRow(s, "active")!;
  assert.deepEqual(active.cells.map((c) => c.v), [100, 100, 50]);
  assert.equal(active.total.v, 180); // 고유 기기는 칸의 합이 아니라 기간 전체를 다시 센 값
  assert.deepEqual(seriesRow(s, "returning")!.cells.map((c) => c.v), [80, 80, 45]);
  // DB 건수는 칸의 합, 비율은 기간 전체로 다시 센 값
  assert.equal(seriesRow(s, "signups")!.total.v, 21);
  assert.equal(seriesRow(s, "coupon_rate_db")!.total.v, 28);
  assert.equal(seriesRow(s, "stickiness")!.label, "DAU/WAU");
  assert.ok(s.caveats.some((c) => c.includes("＊ 표시 칸")));
});

test("빈 칸은 0 이 아니라 이유를 단다", () => {
  const s = buildSeries({
    spec: spec("week", "2026-08-24", "2026-09-06"), through: "20261013", today: TODAY,
    cells: [
      full({ ga4: null, coupons: coupons({ coverage: { wallet_to_use: "none", redeem_outcome: "none" } }), db: null }),
      full({ db: db({ signups: 3, stamp_earned: null }, ["stamp_earned"]), coupons: coupons({ organic: { issued: 0, redeemed: 0, rate: null } }) }),
    ],
    total: full(),
  });
  const cell = (k: string, i: number) => seriesRow(s, k)!.cells[i];
  assert.deepEqual(cell("active", 0), { v: null, why: "못 읽음" });
  assert.equal(cell("signups", 0).why, "못 읽음");
  assert.equal(cell("wallet_to_use", 0).why, "이벤트 없던 기간");
  assert.equal(cell("stamp_earned", 1).why, "못 셈");
  assert.equal(cell("coupon_rate_organic", 1).why, "발급 없음");
  assert.equal(cell("coupon_rate_campaign", 1).why, "발급 없음");
  assert.equal(cell("banner_ctr", 1).why, "노출 이벤트 없음");
  // 한 칸이라도 못 읽으면 DB 합계도 모른다 — 못 센 칸을 0 으로 더하지 않는다
  assert.equal(seriesRow(s, "signups")!.total.v, null);
});

test("표본이 얕으면 흐리게, 분모를 단다", () => {
  const s = buildSeries({
    spec: spec("week", "2026-10-05", "2026-10-11"), through: "20261013", today: TODAY,
    cells: [full({ ga4: ga4({ cohort: { from: "", to: "", users: 12 } }) })],
    total: full(),
  });
  const r = seriesRow(s, "retention_w1")!.cells[0];
  assert.equal(r.weak, true);
  assert.equal(r.n, 12);
  assert.equal(seriesRow(s, "open_to_store")!.cells[0].weak, undefined);
  assert.equal(seriesRow(s, "open_to_store")!.cells[0].n, 400);
});

test("일 단위 — 관찰 창이 하루보다 긴 칸은 비우고, 기간 전체 열은 센다", () => {
  const s = buildSeries({
    spec: spec("day", "2026-10-12", "2026-10-15"), through: "20261013", today: TODAY,
    cells: [full(), full(), { ga4: null, coupons: null, s2c: null, use: null, db: db({ signups: 1 }), ga4Pending: true }, { ga4: null, coupons: null, s2c: null, use: null, db: db({ signups: 0 }), ga4Pending: true }],
    total: full(),
  });
  for (const k of ["retention_w1", "push_open", "banner_to_coupon", "stickiness"]) {
    assert.equal(seriesRow(s, k)!.cells[0].why, "일 단위 없음", k);
    assert.notEqual(seriesRow(s, k)!.total.why, "일 단위 없음", k);
  }
  // 확정 테이블 뒤의 날은 「못 읽음」이 아니라 「집계 전」, DB 는 센다
  assert.equal(seriesRow(s, "active")!.cells[2].why, "집계 전");
  assert.equal(seriesRow(s, "signups")!.cells[2].v, 1);
  assert.deepEqual(s.buckets.map((b) => b.open), [false, false, true, true]);
});

test("쓰기 퍼널 — 7일이 안 지난 쿠폰이 섞이면 흐리게", () => {
  const s = buildSeries({
    spec: spec("week", "2026-10-05", "2026-10-11"), through: "20261013", today: TODAY,
    cells: [full({ use: use({ maturing: 9, coverage: { steps: "partial", failures: "none" } }) })],
    total: full(),
  });
  const red = seriesRow(s, "use_organic_redeemed")!.cells[0];
  assert.equal(red.v, 3);
  assert.equal(red.weak, true);
  assert.match(red.why!, /지켜보는 중 9장/);
  assert.equal(seriesRow(s, "use_organic_screen")!.cells[0].why, "이벤트 중간 배포");
});

test("월 단위 — 이름이 DAU/MAU", () => {
  const s = buildSeries({ spec: spec("month", "2026-08-01", "2026-09-30"), through: "20261013", today: TODAY, cells: [full(), full()], total: full() });
  assert.equal(seriesRow(s, "stickiness")!.label, "DAU/MAU");
  assert.ok(s.caveats.some((c) => c.includes("월 단위의 복귀")));
});

test("칸 수가 안 맞으면 멈춘다", () => {
  assert.throws(() => buildSeries({ spec: spec("week", "2026-10-05", "2026-10-11"), through: null, today: TODAY, cells: [], total: full() }), /칸 수/);
});

test("원본 표 · CSV — 빈 칸은 비우고, 쉼표·따옴표는 감싼다", () => {
  const s = buildSeries({
    spec: spec("week", "2026-09-28", "2026-10-11"), through: "20261013", today: TODAY, generatedAt: "2026-10-15 12:00",
    cells: [full({ ga4: null }), full()], total: full(),
  });
  const csv = seriesCsv(s);
  assert.ok(csv.startsWith("﻿묶음,지표,단위,출처,2026-09-28~2026-10-04,2026-10-05~2026-10-11,기간 전체,정의\r\n"));
  const activeLine = csv.split("\r\n").find((l) => l.startsWith("앱 이용,활성 기기,"))!;
  assert.match(activeLine, /^앱 이용,활성 기기,명,GA4,,100,100,/);
  // 정의에 쉼표가 들어간 행은 따옴표로 감싼다
  assert.ok(csv.split("\r\n").some((l) => /,"[^"]*,[^"]*"$/.test(l)));

  const html = renderRawReport(s, "<div data-preview-bar></div>");
  assert.match(html, /<title>앱 지표 원본 2026\.9\.28 ~ 10\.11 · 주 단위 2칸<\/title>/);
  assert.match(html, /<td class="na" title="못 읽음">–<\/td>/);
  assert.match(html, /기간 전체/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test("매장 상세 이벤트(5/5~) 전에 걸친 칸은 0 이 아니라 「이벤트 없던 기간」", () => {
  const s = buildSeries({
    spec: spec("week", "2026-04-27", "2026-05-17"), through: "20261013", today: TODAY,
    cells: [full({ ga4: ga4({ sessions_with_detail: 0, open_to_store: 0 }) }), full(), full()],
    total: full(),
  });
  const cells = seriesRow(s, "open_to_store")!.cells;
  assert.equal(cells[0].why, "이벤트 없던 기간"); // 4/27~5/3
  assert.equal(cells[1].why, "이벤트 중간 배포"); // 5/4~5/10 — 5/5 에 생겼다
  assert.equal(cells[2].v, 10);
  assert.equal(seriesRow(s, "store_to_coupon")!.cells[0].v, null);
  assert.equal(seriesRow(s, "sessions")!.cells[0].v, 400); // 세션은 그대로 센다
  assert.equal(seriesRow(s, "open_to_store")!.total.why, "이벤트 중간 배포");
});
