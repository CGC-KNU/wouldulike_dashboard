import test from "node:test";
import assert from "node:assert/strict";
import { gaWindow, outcomeOf, summarizeAppScans, summarizeWebScans } from "../src/lib/ga4/qrScansShape";

/** 매장 QR 의 GA4 칸 — 찍었지만 적립이 안 된 스캔과 웹 화면만 연 손님 (1126 민찬) */

test("앱 스캔 결과를 적립 · 하루 한도 · 로그인 전 · 그 밖으로 가른다", () => {
  assert.equal(outcomeOf("credited"), "credited");
  assert.equal(outcomeOf("daily_limit_reached"), "daily_limit");
  assert.equal(outcomeOf("visit_daily_limit_reached"), "daily_limit");
  assert.equal(outcomeOf("http_401"), "not_logged_in");
  assert.equal(outcomeOf("network_error"), "other");
  assert.equal(outcomeOf(null), "other");
});

test("앱 스캔 합계와 매장별 — 매장 없는 행도 합계에는 들어간다", () => {
  const s = summarizeAppScans(
    [
      { rid: "97", result: "credited", n: 1 },
      { rid: "97", result: "daily_limit_reached", n: 3 },
      { rid: "297", result: "http_401", n: 1 },
      { rid: null, result: "network_error", n: 2 },
    ],
    4,
  );
  assert.deepEqual(
    { scans: s.scans, devices: s.devices, credited: s.credited, daily: s.daily_limit, nl: s.not_logged_in, other: s.other },
    { scans: 7, devices: 4, credited: 1, daily: 3, nl: 1, other: 2 },
  );
  assert.deepEqual(s.other_reasons, ["network_error"]);
  assert.deepEqual(s.stores["97"], { scans: 4, credited: 1, daily_limit: 3, not_logged_in: 0 });
  assert.deepEqual(s.stores["297"], { scans: 1, credited: 0, daily_limit: 0, not_logged_in: 1 });
  assert.equal(s.stores["null"], undefined);
});

test("웹 — 로그인 시작은 매장 화면, 완료는 카카오 콜백 경로로 가른다", () => {
  const w = summarizeWebScans(
    [
      { event: "web_stamp_view", path: "/s/97", n: 5 },
      { event: "web_stamp_view", path: "/s/297", n: 2 },
      { event: "web_login", path: "/s/97", n: 3 },
      { event: "web_login", path: "/auth/kakao", n: 2 },
      { event: "web_stamp_add", path: "/s/297", n: 1 },
      { event: "web_install_click", path: "/s/97", n: 1 },
      { event: "page_view", path: "/s/97", n: 9 },
    ],
    6,
  );
  assert.deepEqual(
    { v: w.views, u: w.viewers, ls: w.login_start, ld: w.login_done, e: w.earned, i: w.install_click },
    { v: 7, u: 6, ls: 3, ld: 2, e: 1, i: 1 },
  );
  assert.deepEqual(w.stores["97"], { views: 5, earned: 0 });
  assert.deepEqual(w.stores["297"], { views: 2, earned: 1 });
});

test("GA4 창은 어제까지 — 오늘만 고르면 셀 날이 없다", () => {
  assert.deepEqual(gaWindow("2026-11-16", "2026-11-26", "2026-11-25"), { start: "2026-11-16", end: "2026-11-25" });
  assert.deepEqual(gaWindow("2026-11-01", "2026-11-10", "2026-11-25"), { start: "2026-11-01", end: "2026-11-10" });
  assert.equal(gaWindow("2026-11-26", "2026-11-26", "2026-11-25"), null);
});
