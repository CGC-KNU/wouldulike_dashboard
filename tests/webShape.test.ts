import test from "node:test";
import assert from "node:assert/strict";
import { buildFunnel, ctaTypeSplit, fillDays, hiddenQueries, kstDaysAgo, locationLabel, summarizeTraffic, mergePages, pageKey, sectionSplit, stepSplit, storeClicks, storeOf } from "../src/lib/ga4/webShape";

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

test("맞춤 측정기준 — 등록 전 (not set) 은 따로, 아는 값은 정한 순서로 0 까지 채운다", () => {
  const c = ctaTypeSplit([{ value: "(not set)", count: 3, users: 2 }, { value: "consult", count: 1, users: 1 }]);
  assert.deepEqual(c.rows.map((r) => [r.label, r.count]), [["입점 신청 버튼", 0], ["상담 버튼", 1]]);
  assert.deepEqual(c.unset, { count: 3, users: 2 });
});

test("섹션은 화면 순서대로, 모르는 섹션은 뒤에", () => {
  const s = sectionSplit([{ value: "faq", count: 2, users: 2 }, { value: "new-one", count: 5, users: 4 }, { value: "why", count: 3, users: 3 }]);
  const labels = s.rows.map((r) => r.label);
  assert.ok(labels.indexOf("왜 우주라이크") < labels.indexOf("자주 묻는 질문"));
  assert.equal(labels.at(-1), "new-one");
  assert.equal(s.rows.find((r) => r.value === "app-intro")?.users, 0);
});

test("신청 단계는 intro → pin 순서", () => {
  assert.deepEqual(stepSplit([]).rows.map((r) => r.value), ["intro", "store", "owner", "plan", "benefit", "pin"]);
});

test("버튼 위치 이름 — 고정 버튼 · 섹션 · 모르는 값", () => {
  assert.equal(locationLabel("msticky"), "모바일 하단 버튼");
  assert.equal(locationLabel("plans"), "요금제");
  assert.equal(locationLabel("hero"), "hero");
});

test("검색어가 가려진 몫 — 전체에서 검색어 줄 합을 뺀다, 음수는 0", () => {
  assert.deepEqual(hiddenQueries({ clicks: 3, impressions: 40 }, [{ clicks: 1, impressions: 25 }, { clicks: 0, impressions: 5 }]), { clicks: 2, impressions: 10 });
  assert.deepEqual(hiddenQueries({ clicks: 0, impressions: 4 }, []), { clicks: 0, impressions: 4 });
  assert.deepEqual(hiddenQueries({ clicks: 0, impressions: 2 }, [{ clicks: 0, impressions: 3 }]), { clicks: 0, impressions: 0 });
});

test("KST 날짜 — UTC 로는 전날 밤이어도 한국 날짜로", () => {
  const utc1530 = Date.parse("2026-10-27T15:30:00Z"); // KST 10/28 00:30
  assert.equal(kstDaysAgo(0, utc1530), "2026-10-28");
  assert.equal(kstDaysAgo(1, utc1530), "2026-10-27");
});

test("유입 — 채널 묶음과 출처별을 한 표에서, 캠페인(캠퍼스)은 출처에 붙인다", () => {
  const t = summarizeTraffic([
    { channel: "Unassigned", source: "kakao", medium: "message", campaign: "(not set)", sessions: 2 },
    { channel: "Unassigned", source: "qr", medium: "offline", campaign: "경북대", sessions: 3 },
    { channel: "Unassigned", source: "qr", medium: "offline", campaign: "영남대", sessions: 1 },
    { channel: "Direct", source: "(direct)", medium: "(none)", campaign: "(direct)", sessions: 4 },
  ]);
  assert.deepEqual(t.channels, [{ channel: "Unassigned", sessions: 6 }, { channel: "Direct", sessions: 4 }]);
  // 세션이 같으면 들어온 순서 그대로(안정 정렬)
  assert.deepEqual(t.sources.map((s) => [s.label, s.sessions, s.campaigns]), [
    ["전단 · QR", 4, ["경북대", "영남대"]], ["직접 입력 · 출처 없는 링크", 4, []], ["카카오톡", 2, []],
  ]);
});
