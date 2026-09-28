import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAppReportData, fillAppReportTemplate, lastCompleteWeekEnd, normalizeWeekEnd,
  weekLabel, weekRangeLabel, appReportFilename, type AppStats, type PeriodStats,
} from "../src/lib/draft/appReportData";
import { buildMonthlyAppReportData, previousPeriod } from "../src/lib/draft/appReportMonthly";
import { lastCompleteMonth } from "../src/lib/draft/appReport";
import { appReportMessage, appReportSummary, renderAppReportStatic } from "../src/lib/draft/appReportStatic";
import type { Ga4AppMetrics } from "../src/lib/bigquery/appMetrics";
import { eventCoverage, isCampaignSource, type CouponFunnel } from "../src/lib/bigquery/couponFunnel";

/**
 * 앱 지표 주간 보고서 — 양식에 끼운 결과가 **보낼 수 있는 상태**인지까지 본다.
 * 양식은 렌더 후 <body data-report-status="ok|error"> 로 답하고 경고를 data-report-warnings 에 남긴다.
 * 그 검사를 사람이 눈으로 하지 않도록, 여기서 최소 DOM 위에 양식의 렌더러를 그대로 돌린다.
 */

// 2026-09-14~20 실측값 (BigQuery). 전주는 9/7~13.
const cur: Ga4AppMetrics = {
  through: "2026-09-20", week: { from: "2026-09-14", to: "2026-09-20" },
  wau: 253, new_devices: 164, dau_wau: 20.5, open_to_store: 24.9, sessions: 429,
  sessions_detail_to_coupon: 10,
  retention_w1: 2.5, cohort: { from: "2026-08-31", to: "2026-09-06", users: 40 },
  push_open: 5.4, push: { from: "2026-09-07", to: "2026-09-20", received: 349, opened_android: 19, opened_ios: 35 },
  banner_to_coupon: 10.5, banner: { from: "2026-08-17", to: "2026-09-13", clicked: 19, redeemed: 2 },
};
const prev: Ga4AppMetrics = {
  ...cur, through: "2026-09-13", week: { from: "2026-09-07", to: "2026-09-13" },
  wau: 69, new_devices: 27, dau_wau: 21.3, open_to_store: 34.1, sessions: 132,
  sessions_detail_to_coupon: 9,
  retention_w1: 27.3, cohort: { from: "2026-08-24", to: "2026-08-30", users: 11 },
  push_open: 7.6, push: { from: "2026-08-31", to: "2026-09-13", received: 66, opened_android: 5, opened_ios: 12 },
  banner_to_coupon: 5.3, banner: { from: "2026-08-10", to: "2026-09-06", clicked: 19, redeemed: 1 },
};
const stats: AppStats = {
  since: "2026-09-01T00:00:00+09:00",
  stats: {
    signups_this_month: 154, coupon_issued_this_month: 717, coupon_redeemed_this_month: 24,
    coupon_redeem_rate: 3.3, coupon_expiring_7d: 513, stamp_earned_this_month: 1284,
    stamp_reward_this_month: 96, mileage_entries_this_month: 412, mileage_winners_this_month: 21,
    mileage_exchanges_this_month: 7, push_sent_this_month: 14,
  },
};

/** 2026-09-01~21 실측 (BigQuery) */
const funnel = (over: Partial<CouponFunnel> = {}): CouponFunnel => ({
  window: { from: "2026-09-14", to: "2026-09-20" },
  bySource: [
    { source: "KNUSCSEPT_EVENT", campaign: true, issued: 489, redeemed: 1 },
    { source: "LIMITED_SELECT_TEMP_EVENT", campaign: true, issued: 159, redeemed: 17 },
    { source: "SIGNUP_WELCOME", campaign: false, issued: 56, redeemed: 4 },
    { source: "LIMITED_BONUS", campaign: false, issued: 18, redeemed: 1 },
  ],
  campaign: { issued: 648, redeemed: 18, rate: 2.8 },
  organic: { issued: 74, redeemed: 5, rate: 6.8 },
  wallet: { saw: 209, opened_use: 75, rate: 35.9 },
  attempt: { attempts: 41, ok: 25, failed: 15, rate: 62.5,
             reasons: [{ reason: "http_403", n: 12 }, { reason: "server_error", n: 2 }] },
  pinFailStores: [{ restaurant_id: "56", n: 4 }, { restaurant_id: "233", n: 3 }],
  coverage: { wallet_to_use: "full", redeem_outcome: "full" },
  ...over,
});

type Metric = { key: string; value: number | null; prev?: number | null; scope?: string; status?: string; sample?: number; verdict?: string; note?: string };
const metrics = (d: unknown): Metric[] =>
  ((d as { groups: { metrics: Metric[] }[] }).groups).flatMap((g) => g.metrics);
const find = (d: unknown, key: string): Metric => {
  const m = metrics(d).find((x) => x.key === key);
  assert.ok(m, `${key} 칸이 없습니다`);
  return m;
};

/** 양식의 렌더러를 최소 DOM 위에서 돌려 발송 전 검사 결과를 읽는다 */
function render(html: string): { status: string; warnings: string; text: string } {
  const json = html.match(/<script type="application\/json" id="report-data">\n([\s\S]*?)\n<\/script>/);
  assert.ok(json, "report-data 블록을 못 찾았습니다");
  const scripts = [...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)];
  assert.ok(scripts.length, "렌더러 스크립트를 못 찾았습니다");
  const nodes: Record<string, { textContent?: string; innerHTML: string }> = {
    "report-data": { textContent: json[1], innerHTML: "" },
    app: { innerHTML: "" },
    err: { innerHTML: "" },
  };
  const body = { dataset: {} as Record<string, string> };
  const prevDoc = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = { getElementById: (id: string) => nodes[id] ?? null, body };
  try {
    new Function(scripts[scripts.length - 1][1])();
  } finally {
    (globalThis as { document?: unknown }).document = prevDoc;
  }
  return {
    status: body.dataset.reportStatus ?? "",
    warnings: body.dataset.reportWarnings ?? "",
    text: nodes.app.innerHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  };
}

test("마지막으로 다 끝난 주는 그 주 일요일에서 끊는다", () => {
  assert.equal(lastCompleteWeekEnd("20260920"), "20260920"); // 일요일 당일
  assert.equal(lastCompleteWeekEnd("20260921"), "20260920"); // 월요일 — 새 주는 아직 하루치
  assert.equal(lastCompleteWeekEnd("20260919"), "20260913"); // 토요일 — 그 주는 안 끝났다
});

test("아무 요일을 줘도 그 주 일요일을 가리킨다", () => {
  assert.equal(normalizeWeekEnd("2026-09-14"), "20260920"); // 월
  assert.equal(normalizeWeekEnd("2026-09-20"), "20260920"); // 일
  assert.equal(normalizeWeekEnd("20260917"), "20260920"); // 목, 하이픈 없이
  assert.equal(normalizeWeekEnd("2026-09-31"), null); // 없는 날짜
  assert.equal(normalizeWeekEnd("어제"), null);
});

test("주차·기간 표시", () => {
  assert.equal(weekLabel("20260906"), "9월 1주차");
  assert.equal(weekLabel("20260920"), "9월 3주차");
  assert.equal(weekLabel("20261004"), "10월 1주차");
  assert.equal(weekRangeLabel("20260914", "20260920"), "9/14(월)~9/20(일)");
  assert.ok(appReportFilename("20260920").startsWith("앱지표_주간보고서_9월3주차_"));
});

test("주간 값을 못 읽으면 DB·푸시 칸에 「이번 달 누계」가 붙는다 — 월 누계가 주간으로 읽히는 사고를 막는다", () => {
  const d = buildAppReportData({ end: "20260920", cur, prev, stats, today: "2026-09-22" });
  for (const m of metrics(d)) {
    const src = (m as unknown as { source: string }).source;
    if ((src === "backend" || src === "push") && m.value !== null) {
      // 7일 안에 만료만 예외 — 누계가 아니라 읽는 시점 기준 앞으로 7일이다
      const want = m.key === "coupon_expiring" ? "period" : "month_to_date";
      assert.equal(m.scope, want, `${m.key} 의 scope`);
    }
  }
  assert.equal(find(d, "coupon_issued").scope, "month_to_date");
  assert.equal(find(d, "push_sent").scope, "month_to_date");
  // 월 누계 칸에는 전주 대비를 붙이지 않는다
  assert.equal(find(d, "coupon_issued").prev, undefined);
});

test("표본이 얕은 칸에는 전주 대비를 붙이지 않는다", () => {
  const d = buildAppReportData({ end: "20260920", cur, prev, stats, today: "2026-09-22" });
  const ban = find(d, "banner_to_coupon");
  assert.equal(ban.sample, 19);
  assert.equal(ban.prev, undefined, "19대 표본에 전주 대비가 붙었습니다");
  // 40대 코호트는 30 이상이라 붙인다
  const ret = find(d, "retention_w1");
  assert.equal(ret.sample, 40);
  assert.equal(ret.prev, 27.3);
});

test("분모가 반 이상 달라진 주의 비율은 판정을 유보한다", () => {
  const d = buildAppReportData({ end: "20260920", cur, prev, stats, today: "2026-09-22" });
  assert.equal(find(d, "dau_wau").verdict, "flat", "WAU 69→253 인데 DAU/WAU 를 빨갛게 칠하면 안 된다");
  // 분모가 비슷하면 그대로 둔다
  const mild = buildAppReportData({ end: "20260920", cur, prev: { ...prev, wau: 240 }, stats, today: "2026-09-22" });
  assert.equal(find(mild, "dau_wau").verdict, undefined);
});

test("양식에 끼우면 보낼 수 있는 상태로 렌더된다", () => {
  const d = buildAppReportData({ end: "20260920", cur, prev, stats, today: "2026-09-22", coupons: funnel(), couponsPrev: funnel() });
  const r = render(fillAppReportTemplate(d));
  assert.equal(r.status, "ok", `빠진 값이 있습니다`);
  assert.equal(r.warnings, "", `양식 경고: ${r.warnings}`);
  assert.match(r.text, /9월 3주차/);
  // 18칸 중 2칸은 일부러 비운다 — 「매장 상세 → 쿠폰 발급」(정의 보류) · 「배너 노출 → 클릭」(앱 수정 대기)
  assert.match(r.text, /채워진 지표 20\/22/);
  const empty = metrics(d).filter((m) => m.value === null).map((m) => m.key).sort();
  assert.deepEqual(empty, ["banner_ctr", "store_to_coupon"]);
  assert.match(r.text, /이번 달 누계/);
});

test("GA4 를 못 읽어도 렌더되고, 그 칸은 0 이 아니라 「연결 전」이 된다", () => {
  const d = buildAppReportData({ end: "20260920", cur: null, prev: null, stats, today: "2026-09-22" });
  assert.equal(find(d, "wau").value, null);
  assert.equal(find(d, "wau").status, "pending");
  const r = render(fillAppReportTemplate(d));
  assert.equal(r.status, "ok");
  assert.equal(r.warnings, "");
  assert.match(r.text, /연결 전/);
});

test("백엔드를 못 읽어도 렌더되고, DB 칸이 「연결 전」이 된다", () => {
  const d = buildAppReportData({ end: "20260920", cur, prev, stats: null, today: "2026-09-22" });
  assert.equal(find(d, "coupon_issued").value, null);
  assert.equal(find(d, "coupon_issued").status, "pending");
  const r = render(fillAppReportTemplate(d));
  assert.equal(r.status, "ok");
  assert.equal(r.warnings, "");
});

// ── 주간 DB 칸 (app-stats/period) ────────────────────────────────────
const week = (over: Record<string, number | null> = {}, complete = true, failed: string[] = []): PeriodStats => ({
  start: "2026-09-14", end: "2026-09-20", complete, failed,
  stats: {
    signups: 41, coupon_issued: 180, coupon_redeemed: 12, coupon_redeem_rate: 6.7, stamp_earned: 305,
    stamp_reward: 22, mileage_entries: 96, mileage_winners: 5, mileage_exchanges: 2, push_sent: 4, ...over,
  },
});
const weekPrev: PeriodStats = {
  start: "2026-09-07", end: "2026-09-13", complete: true, failed: [],
  stats: {
    signups: 30, coupon_issued: 150, coupon_redeemed: 8, coupon_redeem_rate: 9.1, stamp_earned: 250,
    stamp_reward: 18, mileage_entries: 70, mileage_winners: 3, mileage_exchanges: 1, push_sent: 5,
  },
};
const weekly = (over: Partial<Parameters<typeof buildAppReportData>[0]> = {}) =>
  buildAppReportData({ end: "20260920", cur, prev, stats, week: week(), weekPrev, today: "2026-09-22", ...over });

test("주간 값이 있으면 DB 칸은 그 주 값이고 전주 대비가 붙는다", () => {
  const d = weekly();
  for (const [key, value, before] of [
    ["signups_month", 41, 30], ["coupon_issued", 180, 150], ["coupon_used", 12, 8], ["stamp_earned", 305, 250],
    ["stamp_reward", 22, 18], ["mileage_entries", 96, 70], ["mileage_winners", 7, 4], ["push_sent", 4, 5],
  ] as const) {
    const m = find(d, key);
    assert.equal(m.value, value, `${key} 값`);
    assert.equal(m.prev, before, `${key} 전주`);
    assert.equal(m.scope, "period", `${key} scope`);
  }
  // 스탬프는 적립 「횟수」라고 칸에 적는다 — 일일 운영 리포트(개수)와 헷갈리지 않게
  assert.match(find(d, "stamp_earned").note ?? "", /횟수/);
  assert.match(find(d, "mileage_winners").note ?? "", /당첨 5 · 마일리지로 쿠폰 교환 2/);
  const report = (d as { report: { note: string } }).report;
  assert.match(report.note, /app-stats\/period/);
  assert.doesNotMatch(report.note, /이번 달 누계\*\*/);
});

test("주간 보고서에서 「이번 달 누계」로 남는 DB 칸은 「발급 → 사용」 하나뿐이다", () => {
  const d = weekly();
  const mtd = metrics(d).filter((m) => m.scope === "month_to_date").map((m) => m.key);
  assert.deepEqual(mtd, ["coupon_rate"]);
  assert.equal(find(d, "coupon_rate").value, 3.3); // app-stats 의 이번 달 값 — 주간 값(6.7)이 아니다
  // 7일 안에 만료는 읽는 시점 기준이라 전주 대비가 없다
  assert.equal(find(d, "coupon_expiring").value, 513);
  assert.equal(find(d, "coupon_expiring").prev, undefined);
});

test("아직 안 끝난 주는 전주 대비를 붙이지 않는다", () => {
  const d = weekly({ week: week({}, false) });
  assert.equal(find(d, "coupon_used").value, 12);
  assert.equal(find(d, "coupon_used").prev, undefined);
  assert.ok((d as { caveats: string[] }).caveats.some((c) => c.includes("아직 끝나지 않았습니다")));
});

test("전주를 못 읽으면 값은 있고 증감만 빠진다", () => {
  const d = weekly({ weekPrev: null });
  assert.equal(find(d, "stamp_earned").value, 305);
  assert.equal(find(d, "stamp_earned").prev, undefined);
  assert.ok((d as { caveats: string[] }).caveats.some((c) => c.includes("전주 DB 칸을 읽지 못했습니다")));
});

test("주간 값에서 못 센 칸은 0 이 아니라 비우고 이유를 적는다", () => {
  const d = weekly({ week: week({ stamp_earned: null }, true, ["stamp_earned"]) });
  const m = find(d, "stamp_earned");
  assert.equal(m.value, null);
  assert.equal(m.status, "pending");
  assert.match(m.note ?? "", /세지 못했습니다/);
  assert.ok((d as { caveats: string[] }).caveats.some((c) => c.includes("못 센 칸이 있습니다")));
});

test("app-stats 없이 주간 값만 있어도 DB 칸은 채워지고, 이번 달 칸만 비는다", () => {
  const d = weekly({ stats: null });
  assert.equal(find(d, "coupon_used").value, 12);
  assert.equal(find(d, "coupon_rate").value, null);
  assert.equal(find(d, "coupon_expiring").value, null);
});

test("주간 값으로 양식에 끼워도 보낼 수 있는 상태로 렌더된다", () => {
  const d = weekly({ coupons: funnel(), couponsPrev: funnel() });
  const r = render(fillAppReportTemplate(d));
  assert.equal(r.status, "ok", `빠진 값이 있습니다`);
  assert.equal(r.warnings, "", `양식 경고: ${r.warnings}`);
  assert.match(r.text, /채워진 지표 20\/22/);
});

// ── 월간 ────────────────────────────────────────────────────────────
const augGa4: Ga4AppMetrics = {
  through: "2026-08-31", week: { from: "2026-08-01", to: "2026-08-31" },
  wau: 128, new_devices: 61, dau_wau: 5.5, open_to_store: 26.2, sessions: 275,
  sessions_detail_to_coupon: 18,
  retention_w1: 27.8, cohort: { from: "2026-08-01", to: "2026-08-18", users: 18 },
  push_open: 1.4, push: { from: "2026-08-01", to: "2026-08-31", received: 70, opened_android: 1, opened_ios: 3 },
  banner_to_coupon: 0, banner: { from: "2026-08-01", to: "2026-08-24", clicked: 11, redeemed: 0 },
};
const julGa4: Ga4AppMetrics = {
  ...augGa4, through: "2026-07-31", week: { from: "2026-07-01", to: "2026-07-31" },
  wau: 116, new_devices: 38, dau_wau: 4.6, open_to_store: 23.6, sessions: 212,
};
const side = (period: string, over: Record<string, number | null> = {}, complete = true) => ({
  period, complete, counted_at: "2026-09-22T02:10:00+09:00", failed: [] as string[],
  stats: {
    signups: 120, coupon_issued: 400, coupon_redeemed: 31, coupon_redeem_rate: 7.8,
    stamp_earned: 1102, stamp_reward: 88, mileage_entries: 0, mileage_winners: 0,
    mileage_exchanges: 0, push_sent: 9, ...over,
  },
});

test("월간: DB 칸은 그 달만의 값이라 전월 대비가 붙는다", () => {
  const d = buildMonthlyAppReportData({
    period: "2026-08", cur: augGa4, prev: julGa4,
    snapshot: { period: "2026-08", current: side("2026-08"), previous: side("2026-07", { signups: 90 }) },
    today: "2026-09-22",
  });
  const signups = find(d, "signups");
  assert.equal(signups.value, 120);
  assert.equal(signups.prev, 90, "월간은 전월 대비가 있어야 한다 — 이게 월간 보고서의 이유다");
  assert.equal(signups.scope, "period", "주간의 month_to_date 와 달라야 한다");
  const r = render(fillAppReportTemplate(d));
  assert.equal(r.status, "ok");
  assert.equal(r.warnings, "");
  assert.match(r.text, /2026년 8월/);
  assert.doesNotMatch(r.text, /이번 달 누계/, "월간에 「이번 달 누계」 배지가 뜨면 안 된다");
});

test("월간: 창이 한 달이라 DAU/MAU 로 이름이 바뀌고 각주도 갈린다", () => {
  const d = buildMonthlyAppReportData({
    period: "2026-08", cur: augGa4, prev: julGa4,
    snapshot: { period: "2026-08", current: side("2026-08"), previous: side("2026-07") },
    today: "2026-09-22",
  });
  assert.equal((find(d, "dau_wau") as unknown as { label: string }).label, "DAU/MAU");
  assert.equal((find(d, "wau") as unknown as { label: string }).label, "월간 활성(MAU)");
  const r = render(fillAppReportTemplate(d));
  assert.match(r.text, /DAU\/MAU/);
  assert.match(r.text, /월간 활성\(MAU\)/);
  assert.doesNotMatch(r.text, /20%를 넘으면 습관이 붙은 것으로 봅니다/, "20% 기준은 주간 각주에만 있어야 한다");
});

test("월간: 스냅샷이 없으면 DB 칸은 0 이 아니라 「연결 전」", () => {
  const d = buildMonthlyAppReportData({
    period: "2026-07", cur: julGa4, prev: null, snapshot: null, today: "2026-09-22",
  });
  const signups = find(d, "signups");
  assert.equal(signups.value, null);
  assert.equal(signups.status, "pending");
  assert.equal(signups.prev, undefined);
  const r = render(fillAppReportTemplate(d));
  assert.equal(r.status, "ok");
  assert.equal(r.warnings, "");
  assert.match(r.text, /스냅샷이 없어 DB 칸이 비었습니다/);
});

test("월간: 전월 스냅샷만 없으면 값은 있고 증감만 빠진다", () => {
  const d = buildMonthlyAppReportData({
    period: "2026-08", cur: augGa4, prev: julGa4,
    snapshot: { period: "2026-08", current: side("2026-08"), previous: null },
    today: "2026-09-22",
  });
  const signups = find(d, "signups");
  assert.equal(signups.value, 120);
  assert.equal(signups.prev, undefined, "0 으로 두면 「0에서 늘었다」가 된다");
  const r = render(fillAppReportTemplate(d));
  assert.equal(r.status, "ok");
  assert.match(r.text, /전월\(2026년 7월\) 스냅샷이 없어/);
});

test("월간: 아직 안 끝난 달은 누계라고 알린다", () => {
  const d = buildMonthlyAppReportData({
    period: "2026-09", cur: augGa4, prev: julGa4,
    snapshot: { period: "2026-09", current: side("2026-09", {}, false), previous: side("2026-08") },
    today: "2026-09-22",
  });
  const r = render(fillAppReportTemplate(d));
  assert.equal(r.status, "ok");
  assert.match(r.text, /아직 끝나지 않았습니다/);
});

test("월간: 스냅샷이 못 센 칸은 그 이유를 적는다", () => {
  const snap = { ...side("2026-08", { mileage_entries: null }), failed: ["mileage_entries"] };
  const d = buildMonthlyAppReportData({
    period: "2026-08", cur: augGa4, prev: julGa4,
    snapshot: { period: "2026-08", current: snap, previous: side("2026-07") },
    today: "2026-09-22",
  });
  const m = find(d, "mileage_entries");
  assert.equal(m.value, null);
  assert.equal(m.status, "pending");
  const r = render(fillAppReportTemplate(d));
  assert.equal(r.status, "ok");
  assert.match(r.text, /스냅샷을 만들 때 이 칸을 세지 못했습니다/);
});

test("마지막으로 다 끝난 달", () => {
  assert.equal(lastCompleteMonth(Date.parse("2026-09-22T03:00:00Z")), "2026-08");
  assert.equal(lastCompleteMonth(Date.parse("2026-01-05T03:00:00Z")), "2025-12");
  // KST 로 넘어가는 경계 — UTC 12/31 16:00 은 KST 1/1
  assert.equal(lastCompleteMonth(Date.parse("2025-12-31T16:00:00Z")), "2025-12");
  assert.equal(previousPeriod("2026-01"), "2025-12");
  assert.equal(previousPeriod("2026-09"), "2026-08");
});

// ── 쿠폰 발급 → 사용 ─────────────────────────────────────────────────
test("캠페인 코드인지 아닌지는 코드가 이미 그어 둔 경계로 가른다", () => {
  // issue_key 에서 나온 값들 (frontend resolveCouponIssueSource 의 반환값)
  for (const s of ["SIGNUP_WELCOME", "STAMP_REWARD", "REFERRAL", "LIMITED_BONUS", "other", "unknown"]) {
    assert.equal(isCampaignSource(s), false, `${s} 는 캠페인이 아니다`);
  }
  // 그 밖은 전부 campaign_code — 새 캠페인이 생겨도 저절로 맞는 쪽에 들어간다
  for (const s of ["KNUSCSEPT_EVENT", "LIMITED_SELECT_TEMP_EVENT", "APP_OPEN_MON_EVENT", "무엇이든_새_캠페인"]) {
    assert.equal(isCampaignSource(s), true, `${s} 는 캠페인이다`);
  }
});

test("한 경로가 발급의 절반을 넘으면 「발급 → 사용」은 판정을 유보한다", () => {
  const d = buildAppReportData({ end: "20260920", cur, prev, stats, today: "2026-09-22", coupons: funnel(), couponsPrev: null });
  const rate = find(d, "coupon_rate");
  assert.equal(rate.verdict, "flat", "489/722 가 한 경로인데 빨갛게 칠하면 안 된다");
  const r = render(fillAppReportTemplate(d));
  assert.match(r.text, /발급의 \d+%가 「KNUSCSEPT_EVENT」 한 경로/);
  assert.match(r.text, /판정은 위 「캠페인 외」 칸으로/);
});

test("캠페인과 그 외를 갈라 두 칸으로 낸다", () => {
  const d = buildAppReportData({ end: "20260920", cur, prev, stats, today: "2026-09-22", coupons: funnel(), couponsPrev: null });
  assert.equal(find(d, "coupon_rate_organic").value, 6.8);
  assert.equal(find(d, "coupon_rate_organic").sample, 74);
  assert.equal(find(d, "coupon_rate_campaign").value, 2.8);
  const r = render(fillAppReportTemplate(d));
  assert.equal(r.status, "ok");
  assert.match(r.text, /쿠폰 사용률 \(캠페인 외\)/);
  assert.match(r.text, /KNUSCSEPT_EVENT 489장 중 1장/);
});

test("이벤트가 없던 기간은 0 이 아니라 비운다 — 8월 「쿠폰함 → 사용 화면」", () => {
  // 8/31 에 생긴 이벤트라 8월 창은 계산상 4.3% 가 나오지만 그건 값이 아니다
  assert.equal(eventCoverage("coupon_use_screen_view", "20260801", "20260831"), "partial");
  assert.equal(eventCoverage("coupon_use_screen_view", "20260701", "20260731"), "none");
  assert.equal(eventCoverage("coupon_use_screen_view", "20260901", "20260930"), "full");
  assert.equal(eventCoverage("coupon_page_view", "20260101", "20260131"), "full", "오래된 이벤트는 늘 full");

  // 8월 창은 partial(8/31 하루만 덮임) — 4.3% 가 계산되지만 값이 아니다
  const julyFunnel = funnel({ wallet: { saw: 47, opened_use: 2, rate: 4.3 },
                              coverage: { wallet_to_use: "partial", redeem_outcome: "none" } });
  const d = buildAppReportData({ end: "20260920", cur, prev, stats, today: "2026-09-22", coupons: julyFunnel, couponsPrev: null });
  const w = find(d, "wallet_to_use");
  assert.equal(w.value, null, "4.3% 를 그대로 실으면 9월 36% 와 나란히 놓여 거짓말이 된다");
  assert.equal(w.status, "app_fix");
  const r = render(fillAppReportTemplate(d));
  assert.equal(r.status, "ok");
  assert.match(r.text, /기간 중간에 앱에 배포됐습니다/);
  assert.match(r.text, /이 기간에는 앱에 없었습니다/);  // 성공률 쪽은 none
});

test("사용 시도 성공률의 분모는 시도가 아니라 성공+실패다", () => {
  // coupon_redeem_attempt 는 8/31 에 생겨 옛 버전에서 안 찍힌다 — 시도를 분모로 쓰면 8월에 150% 가 나왔다
  const f = funnel({ attempt: { attempts: 2, ok: 3, failed: 0, rate: 100, reasons: [] } });
  const d = buildAppReportData({ end: "20260920", cur, prev, stats, today: "2026-09-22", coupons: f, couponsPrev: null });
  const m = find(d, "redeem_success");
  assert.equal(m.value, 100);
  assert.equal(m.sample, 3, "표본은 결과 수(성공+실패)");
  assert.ok((m.value ?? 0) <= 100, "100% 를 넘으면 안 된다");
});

test("PIN 불일치가 몰린 매장을 지표 줄에 적는다", () => {
  const d = buildAppReportData({ end: "20260920", cur, prev, stats, today: "2026-09-22", coupons: funnel(), couponsPrev: null });
  const r = render(fillAppReportTemplate(d));
  assert.match(r.text, /http_403 12/);
  assert.match(r.text, /PIN 불일치가 몰린 매장 #56\(4\)/);
});

test("월간도 같은 네 칸을 받는다", () => {
  const d = buildMonthlyAppReportData({
    period: "2026-08", cur: augGa4, prev: julGa4,
    snapshot: { period: "2026-08", current: side("2026-08"), previous: side("2026-07") },
    today: "2026-09-23", coupons: funnel(), couponsPrev: funnel(),
  });
  assert.equal(find(d, "coupon_rate_campaign").value, 2.8);
  assert.equal(find(d, "coupon_redeem_rate").verdict, "flat");
  const r = render(fillAppReportTemplate(d));
  assert.equal(r.status, "ok");
  assert.equal(r.warnings, "");
});

// ── 데이터 신선도 (fix) ───────────────────────────────────────────────
test("월간 요약 타일은 스냅샷이 없어도 빈 칸으로 채우지 않는다", () => {
  const withSnap = buildMonthlyAppReportData({
    period: "2026-08", cur: augGa4, prev: julGa4,
    snapshot: { period: "2026-08", current: side("2026-08"), previous: side("2026-07") }, today: "2026-09-23",
  }) as { headline?: string[] };
  assert.deepEqual(withSnap.headline, ["wau", "signups", "coupon_redeem_rate", "retention_w1"]);

  // 스냅샷이 없으면 headline 을 아예 안 준다 — 양식이 값 있는 칸에서 넷을 고른다
  const without = buildMonthlyAppReportData({
    period: "2026-08", cur: augGa4, prev: julGa4, snapshot: null, today: "2026-09-23",
  }) as { headline?: string[] };
  assert.equal(without.headline, undefined);
  const r = render(fillAppReportTemplate(without as never));
  assert.equal(r.status, "ok");
  // 타일 줄(요약)에 「연결 전」이 뜨면 안 된다 — 본문에는 있어도 된다
  const tiles = r.text.slice(0, r.text.indexOf("GA4·Firebase 칸은"));
  assert.doesNotMatch(tiles, /연결 전/, "보고서를 열자마자 보이는 줄이 빈 칸이면 안 된다");
});

test("달이 안 끝났으면 GA4 칸이 어디까지인지 알린다", () => {
  // 확정 테이블이 9/21 까지라 9월 창은 9/21 에서 끊긴다
  const short: Ga4AppMetrics = { ...augGa4, through: "2026-09-21", week: { from: "2026-09-01", to: "2026-09-21" } };
  const d = buildMonthlyAppReportData({
    period: "2026-09", cur: short, prev: augGa4,
    snapshot: { period: "2026-09", current: side("2026-09", {}, false), previous: side("2026-08") },
    today: "2026-09-23",
  });
  const r = render(fillAppReportTemplate(d));
  assert.equal(r.status, "ok");
  assert.match(r.text, /GA4 칸은 2026-09-21 까지만 센 값입니다/);
  assert.match(r.text, /GA4 2026-09-21 까지\(달 끝 전\)/);

  // 달이 다 끝났으면 그 문구가 없어야 한다
  const full = buildMonthlyAppReportData({
    period: "2026-08", cur: augGa4, prev: julGa4,
    snapshot: { period: "2026-08", current: side("2026-08"), previous: side("2026-07") }, today: "2026-09-23",
  });
  const rf = render(fillAppReportTemplate(full));
  assert.doesNotMatch(rf.text, /까지만 센 값입니다/);
  assert.doesNotMatch(rf.text, /달 끝 전/);
});

// ── 매장 상세 → 쿠폰 발급 (프로브 빈 칸 연결) ─────────────────────────
import { ISSUE_KEY_SOURCES } from "../src/lib/bigquery/couponFunnel";

/**
 * 이 칸은 "분모는 앱 이벤트, 발급은 DB 라 합쳐야 한다"는 이유로 비어 있었다 — **틀린 전제**였다.
 * restaurant_detail_open 과 coupon_issued 가 둘 다 restaurant_id 를 실어서 GA4 안에서 이어진다.
 * 다만 coupon_issued 는 지갑 diff 라 기획전 쿠폰이 "보이기만 해도" 잡히므로, 분자에서 빼야 한다.
 * 실측(0924, 9/17~23): 상세 174 → 캠페인 포함 10(5.7%) vs 제외 2(1.1%).
 */
test("캠페인 쿠폰을 분자에서 빼는 기준이 코드 한 곳에 있다", () => {
  // readStoreToCoupon 의 SQL 이 쓰는 목록과 isCampaignSource 가 같은 집합이어야 한다 —
  // 갈라지면 화면(캠페인 제외)과 보고서(캠페인/그 외)가 서로 다른 말을 한다.
  for (const s of ["SIGNUP_WELCOME", "STAMP_REWARD", "REFERRAL", "LIMITED_BONUS", "other", "unknown"]) {
    assert.ok(ISSUE_KEY_SOURCES.has(s), `${s} 는 캠페인이 아니어야 한다`);
  }
  for (const s of ["KNUSCSEPT_EVENT", "LIMITED_SELECT_TEMP_EVENT", "무엇이든_새_캠페인"]) {
    assert.ok(!ISSUE_KEY_SOURCES.has(s), `${s} 는 캠페인이어야 한다`);
  }
});

// ── 보고서에서 「정의 보류」였던 칸을 연결한 뒤 ────────────────────────
import { knownSourcesSql } from "../src/lib/bigquery/appMetrics";
import type { StoreToCoupon } from "../src/lib/bigquery/couponFunnel";
import { readFile } from "node:fs/promises";

/** readStoreToCoupon 이 주는 모양. 9/14~20 실측에 맞춘 값. */
const s2c = (over: Partial<StoreToCoupon> = {}): StoreToCoupon => ({
  window: { from: "2026-09-14", to: "2026-09-20" },
  views: 174, claimed: 2, claimed_including_campaign: 10, rate: 1.1,
  ...over,
});

test("매장 상세 → 쿠폰 발급 칸이 값과 분모를 같이 말한다", () => {
  const d = buildAppReportData({
    end: "20260920", cur, prev, stats, today: "2026-09-22",
    coupons: funnel(), couponsPrev: funnel(), storeToCoupon: s2c(),
  });
  const m = find(d, "store_to_coupon");
  assert.equal(m.value, 1.1);
  assert.equal(m.status, undefined, "「정의 보류」가 남아 있으면 안 된다");
  assert.equal(m.sample, 174, "분모를 화면이 알아야 표본이 얕은 걸 말할 수 있다");
  // 정의를 바꾸면 숫자가 5배 달라지는 칸이다 — 둘 다 적어야 읽는 사람이 속지 않는다
  assert.match(String(m.note), /2/);
  assert.match(String(m.note), /10/, "캠페인까지 세면 몇인지도 적는다");
});

test("매장 상세 → 쿠폰 발급을 못 읽으면 0 이 아니라 「연결 전」", () => {
  const d = buildAppReportData({
    end: "20260920", cur, prev, stats, today: "2026-09-22", storeToCoupon: null,
  });
  const m = find(d, "store_to_coupon");
  assert.equal(m.value, null);
  assert.equal(m.status, "pending");
});

test("퍼널은 단계를 포개 세므로 역전될 수 없다", () => {
  // 포개지 않고 각자 세면 상세를 안 열고 쿠폰을 받은 세션이 섞여 3단이 2단보다 커진다.
  // 9/14~20 실측: 포개면 10, 안 포개면 39 — 상세 107 보다 작아 이 주엔 티가 안 나지만,
  // 캠페인이 크게 돌면 언제든 넘어선다. 여기서는 정의 자체를 지킨다.
  const d = buildAppReportData({
    end: "20260920", cur, prev, stats, today: "2026-09-22", storeToCoupon: s2c(),
  });
  const steps = d.funnel as { label: string; value: number | null; unit: string }[];
  assert.equal(steps[0].value, 429, "앱 열기 = 세션");
  assert.equal(steps[1].value, 107, "상세 = 429 × 24.9%");
  assert.equal(steps[2].value, 10, "상세를 보고 그 자리에서 받은 세션");
  const filled = steps.filter((x) => x.value !== null).map((x) => x.value as number);
  for (let i = 1; i < filled.length; i++) {
    assert.ok(filled[i] <= filled[i - 1], `${i}단이 앞 단계보다 크다 — 퍼널 역전`);
  }
  assert.ok(steps.every((x) => x.unit === "세션"), "단위가 섞이면 한 줄에 세울 수 없다");
});

test("퍼널 4단은 비운 채로, 왜 비웠는지를 적는다", () => {
  // 쿠폰은 받은 세션이 아니라 나중 방문에서 쓰인다. 같은 세션으로 포개면 0~3 이 되어
  // 「아무도 안 쓴다」로 읽힌다 — 0 으로 채우는 것보다 비우고 이유를 적는 쪽이 맞다.
  const d = buildAppReportData({
    end: "20260920", cur, prev, stats, today: "2026-09-22", storeToCoupon: s2c(),
  });
  const steps = d.funnel as { label: string; value: number | null; note?: string }[];
  assert.equal(steps[3].value, null);
  assert.match(String(steps[3].note), /나중 방문/);
});

test("캠페인을 가르는 목록이 SQL 과 판정 함수에서 같다", () => {
  // 목록을 두 곳에 적어 두면 한쪽만 고쳐져 같은 보고서 안에서 숫자가 어긋난다.
  // appMetrics 의 퍼널 SQL 과 couponFunnel 의 isCampaignSource 가 이 한 곳을 같이 쓴다.
  const sql = knownSourcesSql();
  for (const s of ISSUE_KEY_SOURCES) {
    assert.ok(sql.includes(`'${s}'`), `${s} 가 SQL 목록에 빠졌다`);
  }
  assert.equal(sql.split(",").length, ISSUE_KEY_SOURCES.size, "SQL 목록에 군더더기가 없다");
});

/**
 * 퍼널이 역전되지 않게 막는 것은 **SQL 한 줄**(`COUNTIF(detail AND coupon)`)이다.
 * 그런데 테스트는 BigQuery 를 돌리지 않으므로, 그 줄을 `COUNTIF(coupon)` 으로 되돌려도
 * 위 검사들이 전부 통과한다(실제로 확인했다). 그래서 쿼리 글자를 직접 본다.
 *
 * 값을 재는 테스트가 아니라 **정의가 조용히 느슨해지는 것**을 막는 테스트다.
 */
test("퍼널 SQL 이 앞 단계를 포개서 센다", async () => {
  const src = await readFile("src/lib/bigquery/appMetrics.ts", "utf8")  // npm test 는 저장소 루트에서 돈다;
  assert.match(src, /COUNTIF\(detail AND coupon\)/,
    "포개지 않으면 상세를 안 열고 쿠폰을 받은 세션이 섞여 3단이 2단보다 커진다");
  assert.doesNotMatch(src, /COUNTIF\(coupon\)/,
    "포개지 않은 셈이 남아 있다");
  // 캠페인 자동 지급을 빼는 조건도 같은 자리에 있어야 한다
  assert.match(src, /coupon_issued' AND src IN \(\$\{knownSources\}\)/,
    "캠페인을 빼지 않으면 이 칸이 몇 배로 부푼다");
});

// ── PROBE 크론 — 스크립트 없는 HTML · 메시지 세 줄 ─────────────────────
test("정적 HTML 에는 스크립트가 없고 다 그려진 화면이 들어 있다", () => {
  const filled = fillAppReportTemplate(weekly({ coupons: funnel(), couponsPrev: funnel() }));
  const r = renderAppReportStatic(filled);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.warnings, []);
  assert.doesNotMatch(r.html, /<script/i, "슬랙·카톡 뷰어는 스크립트를 안 돌린다 — 남아 있으면 빈 화면이 된다");
  assert.match(r.html, /<body data-report-status="ok">/);
  // 테스트의 render() 와 같은 글이 파일에 들어간다
  const text = r.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.ok(text.includes(render(filled).text.slice(0, 200)), "렌더러가 그린 글이 파일에 없습니다");
  assert.match(text, /9월 3주차/);
});

test("정적 HTML — 빠진 값이 있으면 error 로 알린다", () => {
  const d = weekly();
  const r = renderAppReportStatic(fillAppReportTemplate({ ...d, report: { ...(d.report as object), label: "" } }));
  assert.equal(r.status, "error");
  assert.match(r.html, /<body data-report-status="error">/);
});

test("정적 HTML — 글에 $& 가 섞여도 그대로 들어간다", () => {
  const d = weekly();
  (d.groups as { metrics: { key: string; note?: string }[] }[])[0].metrics[0].note = "달러 $& 그대로 $1";
  const r = renderAppReportStatic(fillAppReportTemplate(d));
  assert.ok(r.html.includes("달러 $&amp; 그대로 $1"));
});

test("메시지 세 줄 — 주간 사용자 · 쿠폰 사용 · 스탬프 적립을 보고서에서 그대로 꺼낸다", () => {
  const s = appReportSummary(weekly());
  assert.deepEqual(s.map((x) => [x.label, x.value, x.prev]), [
    ["주간 사용자", 253, 69], ["쿠폰 사용", 12, 8], ["스탬프 적립", 305, 250],
  ]);
  assert.equal(s[1].unit, "건");
});

test("메시지 세 줄 — 이번 달 누계로 떨어진 칸에는 전주 대비를 싣지 않는다", () => {
  const s = appReportSummary(buildAppReportData({ end: "20260920", cur, prev, stats, today: "2026-09-22" }));
  assert.deepEqual(s.map((x) => [x.value, x.prev]), [[253, 69], [24, null], [1284, null]]);
});

test("메시지 세 줄 — 월간은 월간 사용자와 coupon_redeemed 칸을 쓴다", () => {
  const d = buildMonthlyAppReportData({
    period: "2026-08", cur: augGa4, prev: julGa4,
    snapshot: { period: "2026-08", current: side("2026-08"), previous: side("2026-07", { coupon_redeemed: 20, stamp_earned: 900 }) },
    today: "2026-09-22",
  });
  const s = appReportSummary(d);
  assert.deepEqual(s.map((x) => [x.label, x.key, x.value, x.prev]), [
    ["월간 사용자", "wau", 128, 116], ["쿠폰 사용", "coupon_redeemed", 31, 20], ["스탬프 적립", "stamp_earned", 1102, 900],
  ]);
});

// ── PROBE 크론 — 슬랙 메시지 본문 ─────────────────────────────────────
const msgBase = {
  type: "weekly" as const, label: "9월 3주차", range: { start: "2026-09-14", end: "2026-09-20" },
  ready: true, through: "20260920", warnings: [] as string[], link: "https://app.example/r/app?week=2026-09-20",
};

test("메시지 — 세 줄에 값·전주 대비를 싣고, 대시보드 링크로 끝난다", () => {
  const text = appReportMessage({ ...msgBase, summary: appReportSummary(weekly()) });
  const lines = text.split("\n");
  assert.equal(lines[0], ":bar_chart: *앱 지표 주간 보고서 · 9월 3주차* (9/14~9/20)");
  assert.equal(lines[1], "• 주간 사용자 *253명* · 전주 +267%");
  assert.equal(lines[2], "• 쿠폰 사용 *12건* · 전주 +50%");
  assert.equal(lines[3], "• 스탬프 적립 *305건* · 전주 +22%");
  assert.equal(lines.at(-1), "첨부 HTML · <https://app.example/r/app?week=2026-09-20|대시보드에서 열기>");
});

test("메시지 — GA4 가 일요일까지 안 들어왔으면 사용자 줄만 「집계 중」, 나머지는 그대로", () => {
  const text = appReportMessage({
    ...msgBase, summary: appReportSummary(weekly()), ready: false, through: "20260919",
    warnings: ["20260920 까지의 확정 테이블이 아직 없습니다 (20260919 까지). 그 주는 일부만 셉니다.", "쿠폰 퍼널을 읽지 못했습니다 — x"],
  });
  assert.match(text, /• 주간 사용자 — 집계 중 \(GA4 가 9\/20 데이터를 아직 안 보냈습니다\)/);
  assert.doesNotMatch(text, /253명/, "6일치 WAU 를 한 주 값처럼 올리면 안 된다");
  assert.match(text, /• 쿠폰 사용 \*12건\*/);
  assert.match(text, /첨부 파일의 GA4 칸은 9\/19까지 센 값입니다/);
  assert.doesNotMatch(text, /확정 테이블/, "「집계 중」이 이미 말한 경고를 되풀이하지 않는다");
  assert.match(text, /:warning: 쿠폰 퍼널을 읽지 못했습니다/);
});

test("메시지 — 못 읽은 칸, 줄어든 값, 분모 0, 경고가 많을 때", () => {
  const text = appReportMessage({
    ...msgBase,
    summary: [
      { key: "wau", label: "주간 사용자", value: null, prev: null, unit: "명" },
      { key: "coupon_used", label: "쿠폰 사용", value: 6, prev: 8, unit: "건" },
      { key: "stamp_earned", label: "스탬프 적립", value: 1200, prev: 0, unit: "건" },
    ],
    warnings: ["a", "b", "c", "d", "e"],
  });
  assert.match(text, /• 주간 사용자 — 읽지 못함/);
  assert.match(text, /• 쿠폰 사용 \*6건\* · 전주 −25%/);
  assert.match(text, /• 스탬프 적립 \*1,200건\*\n/, "분모가 0 이면 증감을 싣지 않는다");
  assert.match(text, /:warning: c\n:warning: 외 2건/);
});

test("메시지 — 월간은 제목과 비교 기준이 바뀐다", () => {
  const d = buildMonthlyAppReportData({
    period: "2026-08", cur: augGa4, prev: julGa4,
    snapshot: { period: "2026-08", current: side("2026-08"), previous: side("2026-07", { coupon_redeemed: 20, stamp_earned: 900 }) },
    today: "2026-09-22",
  });
  const text = appReportMessage({ ...msgBase, type: "monthly", label: "2026년 8월", range: { start: "2026-08-01", end: "2026-08-31" }, through: "20260831", summary: appReportSummary(d) });
  assert.match(text, /^:bar_chart: \*앱 지표 월간 보고서 · 2026년 8월\*\n/);
  assert.match(text, /• 월간 사용자 \*128명\* · 전월 \+10%/);
  assert.match(text, /• 쿠폰 사용 \*31건\* · 전월 \+55%/);
});

test("그 기간 캠페인 발급이 0장이면 사용률 칸은 「발급 없음」 — 이유 없이 비지 않는다", () => {
  // 9/21~27 실측: 캠페인 쿠폰 0장이라 칸이 status 없이 비어 양식이 경고를 남겼다(0928 첫 PROBE dry_run)
  const f = funnel({ campaign: { issued: 0, redeemed: 0, rate: null } });
  const d = weekly({ coupons: f, couponsPrev: funnel() });
  const m = find(d, "coupon_rate_campaign") as ReturnType<typeof find> & { status_label?: string };
  assert.equal(m.value, null);
  assert.equal(m.status, "none");
  assert.equal(m.status_label, "발급 없음");
  assert.match(m.note ?? "", /캠페인으로 발급한 쿠폰이 없습니다/);
  assert.equal(m.prev, undefined);
  const r = render(fillAppReportTemplate(d));
  assert.equal(r.status, "ok");
  assert.equal(r.warnings, "", `양식 경고: ${r.warnings}`);
  assert.match(r.text, /발급 없음/);
  // 캠페인 외는 발급이 있으니 그대로 값이 나온다
  assert.equal(find(d, "coupon_rate_organic").value, 6.8);
});

// ── 「해당 없음」은 못 채운 칸이 아니다 ──────────────────────────────
/**
 * status "none" 은 **그 기간에 셀 대상이 없었다**는 뜻이다(캠페인 발급 0건이면
 * 사용률을 낼 분모가 없다). 아직 못 채운 칸(pending · app_fix · undefined)과 같이 세면
 * 「20/22」가 우리가 뭔가 놓친 것처럼 읽힌다 — 셋은 할 일이 있고 none 은 할 일이 없다.
 */
test("셀 대상이 없는 칸은 분모에서 빼고 따로 말한다", () => {
  const d = buildAppReportData({
    end: "20260920", cur, prev, stats, today: "2026-09-22",
    // 캠페인 발급이 0건인 주 — coupon_rate_campaign 이 status "none" 이 된다
    coupons: funnel({ campaign: { issued: 0, redeemed: 0, rate: null } }),
    couponsPrev: funnel(),
  });
  const camp = find(d, "coupon_rate_campaign");
  assert.equal(camp.value, null);
  assert.equal(camp.status, "none", "「연결 전」이 아니라 「해당 없음」");

  const r = render(fillAppReportTemplate(d));
  // 머리말만 본다 — 맨 아래 범례에도 「해당 없음(발급 없음) = …」 설명이 있어서
  // 글 전체에서 찾으면 아무 때나 걸린다.
  const head = /채워진 지표 (\d+)\/(\d+)( · 해당 없음 (\d+))?/.exec(r.text);
  assert.ok(head, "채워진 지표 표기를 찾지 못했다");
  assert.equal(head![4], "1", "머리말이 「해당 없음 1」을 따로 말한다");
  assert.equal(Number(head![2]), metrics(d).length - 1, "분모에서 1칸 빠져야 한다");
  assert.equal(r.status, "ok");
});

test("아직 못 채운 칸은 그대로 분모에 남는다 — 할 일이 있다", () => {
  // banner_ctr 은 app_fix — 앱 릴리스를 기다리는 중이고, 우리가 할 일이 남아 있다
  const d = buildAppReportData({ end: "20260920", cur, prev, stats, today: "2026-09-22", coupons: funnel(), couponsPrev: funnel() });
  const ctr = find(d, "banner_ctr");
  assert.equal(ctr.status, "app_fix");
  const r = render(fillAppReportTemplate(d));
  const head = /채워진 지표 (\d+)\/(\d+)( · 해당 없음 (\d+))?/.exec(r.text);
  assert.equal(Number(head![2]), metrics(d).length, "none 이 없으면 분모는 전체 그대로");
  assert.equal(head![3], undefined, "머리말에 「해당 없음」을 붙이지 않는다");
});

test("배너 노출 칸의 설명이 현재 사실과 맞는다", () => {
  // 0927 에 앱 PR 이 머지돼 호출부가 생겼다. 「상수만 있고 호출하는 곳이 없다」는
  // 더 이상 사실이 아니다 — 남은 것은 스토어 릴리스다.
  const d = buildAppReportData({ end: "20260920", cur, prev, stats, today: "2026-09-22" });
  const note = String(find(d, "banner_ctr").note);
  assert.doesNotMatch(note, /상수만 있고/, "낡은 설명이 남아 있다");
  assert.match(note, /릴리스/, "무엇을 기다리는지 말한다");
});

// ── WAU: 설치가 몰린 주와 견줄 때 ────────────────────────────────────
import { returningBase } from "../src/lib/draft/appReportData";

/**
 * 2026-09 에 실제로 있었던 일이다.
 *   9/14~20  WAU 253 (첫 실행 164 · 65%)  ← 설치가 몰린 주
 *   9/21~27  WAU  93 (첫 실행   9 · 10%)
 * 그대로 보면 「▼63.2%」인데, 처음 온 기기를 빼면 89 → 84 로 거의 그대로다.
 * 「쓰던 사람이 떠났다」와 「전주에 설치가 몰렸다가 안 남았다」는 뜻이 완전히 다르다.
 */
test("설치가 몰린 주와 견줄 때는 처음 온 기기를 빼고 같이 말한다", () => {
  const spike = { ...cur, wau: 253, new_devices: 164 };
  const after = { ...cur, wau: 93, new_devices: 9 };
  const r = returningBase(after, spike);
  assert.ok(r);
  assert.equal(r!.prev, 89);
  assert.equal(r!.cur, 84);
  assert.equal(r!.delta, -5.6);
  assert.equal(r!.mixShifted, true, "첫 실행 비중이 65% → 10% 로 벌어졌다");

  const d = buildAppReportData({ end: "20260927", cur: after, prev: spike, stats, today: "2026-09-28" });
  const w = find(d, "wau");
  assert.equal(w.value, 93);
  assert.equal(w.prev, 253, "날것의 값은 그대로 둔다 — 사실이다");
  assert.equal(w.verdict, "flat", "색을 칠하면 「쓰던 사람이 떠났다」로 읽힌다");
  assert.match(String(w.note), /처음 온 기기를 빼면 89 → 84대\(-5\.6%\)/);
});

test("구성이 비슷한 주끼리는 갈라 적지 않는다 — 군더더기가 된다", () => {
  const a = { ...cur, wau: 100, new_devices: 20 };   // 20%
  const b = { ...cur, wau: 90, new_devices: 16 };    // 17.8% — 2.2%p 차이
  assert.equal(returningBase(a, b)!.mixShifted, false);

  const d = buildAppReportData({ end: "20260927", cur: a, prev: b, stats, today: "2026-09-28" });
  const w = find(d, "wau");
  assert.equal(w.verdict, undefined, "평범한 주는 색을 칠한다");
  assert.doesNotMatch(String(w.note), /처음 온 기기를 빼면/);
});

test("첫 실행 수를 모르면 아무 말도 하지 않는다", () => {
  assert.equal(returningBase({ ...cur, wau: 93, new_devices: null }, { ...cur, wau: 253, new_devices: 164 }), null);
  assert.equal(returningBase({ ...cur, wau: 93, new_devices: 9 }, { ...cur, wau: null, new_devices: null }), null);
});

test("돌아온 기기가 음수로 나오면 말하지 않는다 — 창이 어긋난 것이다", () => {
  // first_open 코호트 창과 활성 창이 어긋나면 새 기기가 활성보다 많게 잡힐 수 있다
  assert.equal(returningBase({ ...cur, wau: 10, new_devices: 12 }, { ...cur, wau: 100, new_devices: 10 }), null);
});
