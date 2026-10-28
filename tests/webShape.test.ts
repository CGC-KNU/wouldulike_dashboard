import test from "node:test";
import assert from "node:assert/strict";
import { buildFunnel, fillDays, mergePages, pageKey, storeClicks, storeOf } from "../src/lib/ga4/webShape";

/**
 * Probe · 웹 지표(1028 A) — GA4 응답을 화면 숫자로 바꾸는 부분.
 * 끝 슬래시가 다른 같은 페이지를 한 줄로, 앱스토어 · 플레이스토어만 설치 버튼으로, 깔때기는 단계별 사람 수로.
 */

test("페이지 키 — 끝 슬래시 · www 를 떼고 루트는 그대로", () => {
  assert.equal(pageKey("wouldulike.kr", "/"), "wouldulike.kr/");
  assert.equal(pageKey("www.wouldulike.kr", "/students/"), "wouldulike.kr/students");
  assert.equal(pageKey("app.wouldulike.kr", "/join"), "app.wouldulike.kr/join");
});

test("같은 페이지는 합친다 — 조회는 더하고 사람은 큰 쪽", () => {
  const p = mergePages([
    { host: "wouldulike.kr", path: "/students/", users: 3, views: 3 },
    { host: "wouldulike.kr", path: "/students", users: 2, views: 4 },
    { host: "wouldulike.kr", path: "/", users: 5, views: 11 },
  ]);
  assert.deepEqual(p.map((x) => [x.label, x.users, x.views]), [["사장님 홈", 5, 11], ["학생 소개", 3, 7]]);
});

test("설치 버튼은 앱스토어 · 플레이스토어만 — 인스타 링크는 뺀다", () => {
  assert.equal(storeOf("apps.apple.com"), "ios");
  assert.equal(storeOf("play.google.com"), "android");
  assert.equal(storeOf("www.instagram.com"), null);
  const s = storeClicks([
    { linkDomain: "apps.apple.com", host: "wouldulike.kr", path: "/students/", count: 2 },
    { linkDomain: "play.google.com", host: "wouldulike.kr", path: "/students", count: 1 },
    { linkDomain: "play.google.com", host: "wouldulike.kr", path: "/", count: 4 },
    { linkDomain: "www.instagram.com", host: "wouldulike.kr", path: "/", count: 9 },
  ]);
  assert.equal(s.ios, 2);
  assert.equal(s.android, 5);
  assert.deepEqual(s.byPage.map((p) => [p.label, p.ios, p.android]), [["사장님 홈", 0, 4], ["학생 소개", 2, 1]]);
});

test("깔때기 — 페이지 사람 수와 이벤트 사람 수를 단계별로, 없으면 0", () => {
  const pages = mergePages([
    { host: "wouldulike.kr", path: "/", users: 5, views: 11 },
    { host: "app.wouldulike.kr", path: "/join", users: 2, views: 3 },
  ]);
  assert.deepEqual(buildFunnel(pages, [{ name: "sign_up", users: 1 }]), { home: 5, join: 2, step: 0, signup: 1 });
});

test("일별 — 방문 없는 날은 0 으로 채운다", () => {
  const d = fillDays(["2026-10-26", "2026-10-27"], [{ date: "20261027", users: 6, sessions: 9 }]);
  assert.deepEqual(d, [{ date: "2026-10-26", users: 0, sessions: 0 }, { date: "2026-10-27", users: 6, sessions: 9 }]);
});
