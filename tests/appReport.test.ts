import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAppReportData, fillAppReportTemplate, lastCompleteWeekEnd, normalizeWeekEnd,
  weekLabel, weekRangeLabel, appReportFilename, type AppStats,
} from "../src/lib/draft/appReportData";
import type { Ga4AppMetrics } from "../src/lib/bigquery/appMetrics";

/**
 * 앱 지표 주간 보고서 — 양식에 끼운 결과가 **보낼 수 있는 상태**인지까지 본다.
 * 양식은 렌더 후 <body data-report-status="ok|error"> 로 답하고 경고를 data-report-warnings 에 남긴다.
 * 그 검사를 사람이 눈으로 하지 않도록, 여기서 최소 DOM 위에 양식의 렌더러를 그대로 돌린다.
 */

// 2026-09-14~20 실측값 (BigQuery). 전주는 9/7~13.
const cur: Ga4AppMetrics = {
  through: "2026-09-20", week: { from: "2026-09-14", to: "2026-09-20" },
  wau: 253, new_devices: 164, dau_wau: 20.5, open_to_store: 24.9, sessions: 429,
  retention_w1: 2.5, cohort: { from: "2026-08-31", to: "2026-09-06", users: 40 },
  push_open: 5.4, push: { from: "2026-09-07", to: "2026-09-20", received: 349, opened_android: 19, opened_ios: 35 },
  banner_to_coupon: 10.5, banner: { from: "2026-08-17", to: "2026-09-13", clicked: 19, redeemed: 2 },
};
const prev: Ga4AppMetrics = {
  ...cur, through: "2026-09-13", week: { from: "2026-09-07", to: "2026-09-13" },
  wau: 69, new_devices: 27, dau_wau: 21.3, open_to_store: 34.1, sessions: 132,
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

type Metric = { key: string; value: number | null; prev?: number | null; scope?: string; status?: string; sample?: number; verdict?: string };
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

test("DB·푸시 칸에는 반드시 「이번 달 누계」가 붙는다 — 월 누계가 주간으로 읽히는 사고를 막는다", () => {
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
  const d = buildAppReportData({ end: "20260920", cur, prev, stats, today: "2026-09-22" });
  const r = render(fillAppReportTemplate(d));
  assert.equal(r.status, "ok", `빠진 값이 있습니다`);
  assert.equal(r.warnings, "", `양식 경고: ${r.warnings}`);
  assert.match(r.text, /9월 3주차/);
  // 18칸 중 2칸은 일부러 비운다 — 「매장 상세 → 쿠폰 발급」(정의 보류) · 「배너 노출 → 클릭」(앱 수정 대기)
  assert.match(r.text, /채워진 지표 16\/18/);
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
