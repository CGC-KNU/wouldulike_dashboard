import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSeries, IDLE_STORES_TABLE, seriesRow, SERIES_KEYS } from "../src/lib/draft/appSeriesData";
import { longCsv, renderRawReport, seriesCsv } from "../src/lib/draft/appRawReport";
import { calmWeeks } from "../src/lib/draft/appSeries";
import { ACCOUNT_EXCLUSION, campaignEvents, FIXED_EVENTS } from "../src/lib/draft/appEvents";
import { coupons, db, full, ga4, line, spec, TODAY, use } from "./_appSeriesFixtures";

/** 앱 지표 기간 × 단위 표 — 칸마다 읽은 값을 지표 행으로(1015 · 1022 기획팀 검토). 숫자는 지어낸 것이다. */

test("주 단위 — 칸마다 같은 정의, 진행 중인 칸 표시", () => {
  const s = buildSeries({
    spec: spec("week", "2026-09-28", "2026-10-15"), through: "20261013", today: TODAY, generatedAt: "2026-10-15 12:00",
    cells: [full(), full(), full({ ga4: ga4({ wau: 50, new_devices: 5 }) })],
    total: full({ ga4: ga4({ wau: 180, new_devices: 40 }), db: db({ users_redeemed: 20 }) }),
  });
  assert.deepEqual(s.buckets.map((b) => b.open), [false, false, true]); // 10/12~18 은 확정 테이블(10/13)보다 늦게 끝난다
  const active = seriesRow(s, "active")!;
  assert.deepEqual(active.cells.map((c) => c.v), [100, 100, 50]);
  assert.equal(active.total.v, 180); // 고유 기기는 칸의 합이 아니라 기간 전체를 다시 센 값
  assert.equal(active.unit, "대"); // 기기는 「대」(R18)
  assert.deepEqual(seriesRow(s, "returning")!.cells.map((c) => c.v), [80, 80, 45]);
  // DB 건수는 칸의 합, 고유 계정은 기간 전체로 다시 센 값
  assert.equal(seriesRow(s, "signups")!.total.v, 21);
  assert.equal(seriesRow(s, "users_redeemed")!.total.v, 20);
  assert.equal(seriesRow(s, "stickiness")!.label, "DAU/WAU");
  assert.ok(s.caveats.some((c) => c.includes("＊ 표시 칸")));
});

test("같은 이름에 다른 값이 없다 — 쿠폰 사용률 3종 · 마일리지로 쿠폰 교환 · 알림 행 수는 뺐다(S37 · S41 · S15)", () => {
  for (const gone of ["coupon_rate_db", "coupon_rate_organic", "coupon_rate_campaign", "mileage_exchanges", "mileage_entries", "mileage_winners", "push_sent", "push_open"]) {
    assert.ok(!SERIES_KEYS.includes(gone), gone);
  }
  const s = buildSeries({ spec: spec("week", "2026-10-05", "2026-10-11"), through: "20261013", today: TODAY, cells: [full()], total: full() });
  // 쓰기 퍼널 줄 이름에 캠페인 외 · 캠페인이 붙는다(S5)
  assert.equal(seriesRow(s, "use_organic_screen")!.label, "캠페인 외 · 사용 화면");
  assert.equal(seriesRow(s, "use_campaign_rate")!.label, "캠페인 · 쿠폰 7일 사용률");
  assert.equal(seriesRow(s, "use_organic_issued")!.label, "캠페인 외 · 처음 받은 쿠폰");
  assert.equal(seriesRow(s, "coupon_claimed")!.label, "받기 누른 쿠폰");
  // 복귀는 이름 · 출처가 바뀌었다(S33)
  const ret = seriesRow(s, "retention_w1")!;
  assert.equal(ret.label, "첫 실행 기기 1주 후 복귀");
  assert.equal(ret.source, "ga4");
  assert.doesNotMatch(seriesRow(s, "stickiness")!.note, /20%/); // S32
  assert.doesNotMatch(seriesRow(s, "users_redeemed")!.note, /1022/); // S36
});

test("일 단위에서는 하루 평균 활성 줄을 싣지 않는다 — 고유와 같은 값(S31)", () => {
  const day = buildSeries({ spec: spec("day", "2026-10-05", "2026-10-06"), through: "20261013", today: TODAY, cells: [full(), full()], total: full() });
  assert.equal(seriesRow(day, "dau"), null);
  const week = buildSeries({ spec: spec("week", "2026-10-05", "2026-10-11"), through: "20261013", today: TODAY, cells: [full()], total: full() });
  assert.equal(seriesRow(week, "dau")!.agg, "하루 평균");
  assert.equal(seriesRow(week, "active")!.agg, "칸 안 고유");
});

test("쿠폰 발급 — 일·주 칸은 GA4 처음 받은 쿠폰, 월 칸은 월말 스냅샷(없으면 다시 센 값이라고 적는다)", () => {
  const week = buildSeries({ spec: spec("week", "2026-10-05", "2026-10-11"), through: "20261013", today: TODAY, cells: [full({ use: use({ organic: line(30, 3), campaign: line(12, 1) }) })], total: full() });
  const w = seriesRow(week, "coupon_issued")!;
  assert.equal(w.label, "처음 받은 쿠폰");
  assert.equal(w.source, "ga4");
  assert.equal(w.cells[0].v, 42);
  const month = buildSeries({
    spec: spec("month", "2026-08-01", "2026-09-30"), through: "20261013", today: TODAY,
    cells: [full({ snap: null }), full({ snap: { stats: { coupon_issued: 418 }, counted_at: "2026-10-01T00:10:00+09:00", complete: true } })],
    total: full(),
  });
  const m = seriesRow(month, "coupon_issued")!;
  assert.equal(m.label, "쿠폰 발급 (월말 스냅샷)");
  assert.equal(m.source, "snapshot");
  assert.deepEqual(m.cells[0], { v: 10, why: "스냅샷 없음 · 지금 다시 센 값" });
  assert.deepEqual(m.cells[1], { v: 418 });
  assert.equal(m.total.v, 428);
});

test("빈 칸은 0 이 아니라 이유를 단다", () => {
  const s = buildSeries({
    spec: spec("week", "2026-08-24", "2026-09-06"), through: "20261013", today: TODAY,
    cells: [
      full({ ga4: null, coupons: coupons({ coverage: { wallet_to_use: "none", redeem_outcome: "none" } }), db: null }),
      full({ db: db({ signups: 3, stamp_earned: null }, ["stamp_earned"]), use: use({ organic: line(0, 0) }) }),
    ],
    total: full(),
  });
  const cell = (k: string, i: number) => seriesRow(s, k)!.cells[i];
  assert.deepEqual(cell("active", 0), { v: null, why: "못 읽음" });
  assert.equal(cell("signups", 0).why, "못 읽음");
  assert.equal(cell("wallet_to_use", 0).why, "계측 전(8/31~)");
  assert.equal(cell("stamp_earned", 1).why, "못 셈");
  assert.equal(cell("use_organic_rate", 1).why, "발급 없음");
  assert.equal(cell("banner_ctr", 1).why, "계측 전 · 앱 2.5.8~ 노출 없음");
  // 새 칸을 세는 백엔드가 아직 안 나갔으면 0 이 아니라 「백엔드 미반영」
  assert.equal(cell("coupon_users", 1).why, "백엔드 미반영");
  // 한 칸이라도 못 읽으면 DB 합계도 모른다 — 못 센 칸을 0 으로 더하지 않는다
  assert.equal(seriesRow(s, "signups")!.total.v, null);
});

test("지표가 생기기 전 칸은 비우되 합계에서는 0 — QR 방문 적립(10/18~)", () => {
  const s = buildSeries({
    spec: spec("week", "2026-10-05", "2026-10-25"), through: "20261024", today: "20261026",
    cells: [full(), full({ db: db({ qr_visits: 0 }) }), full({ db: db({ qr_visits: 4 }) })],
    total: full(),
  });
  const qr = seriesRow(s, "qr_visits")!;
  assert.equal(qr.cells[0].why, "QR 안내 전(10/18~)");
  assert.equal(qr.cells[2].v, 4);
  assert.equal(qr.total.v, 4);
});

test("표본이 얕으면 흐리게, 분모·분자를 단다", () => {
  const s = buildSeries({
    spec: spec("week", "2026-10-05", "2026-10-11"), through: "20261013", today: TODAY,
    cells: [full({ ga4: ga4({ cohort: { from: "2026-08-25", to: "2026-09-21", users: 12, returned: 2 } }) })],
    total: full(),
  });
  const r = seriesRow(s, "retention_w1")!.cells[0];
  assert.equal(r.weak, true);
  assert.equal(r.n, 12);
  assert.equal(r.x, 2);
  assert.equal(r.span, "8/25~9/21 첫 실행 12대"); // 코호트 날짜·n(S33)
  const o = seriesRow(s, "open_to_store")!.cells[0];
  assert.deepEqual(o, { v: 10, n: 400, x: 40 });
});

test("일 단위 — 관찰 창이 하루보다 긴 칸은 비우고, 기간 전체 열은 센다", () => {
  const s = buildSeries({
    spec: spec("day", "2026-10-12", "2026-10-15"), through: "20261013", today: TODAY,
    cells: [full(), full(), { ga4: null, coupons: null, use: null, db: db({ signups: 1 }), ga4Pending: true }, { ga4: null, coupons: null, use: null, db: db({ signups: 0 }), ga4Pending: true }],
    total: full(),
  });
  for (const k of ["retention_w1", "banner_to_coupon", "stickiness"]) {
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
  assert.equal(seriesRow(s, "use_organic_screen")!.cells[0].why, "이벤트 중간 배포(8/31~)");
});

test("월 단위 — 이름이 DAU/MAU, 복귀는 그 달 코호트", () => {
  const s = buildSeries({ spec: spec("month", "2026-08-01", "2026-09-30"), through: "20261013", today: TODAY, cells: [full(), full()], total: full() });
  assert.equal(seriesRow(s, "stickiness")!.label, "DAU/MAU");
  assert.equal(seriesRow(s, "retention_w1")!.agg, "그 달 코호트");
  assert.ok(s.caveats.some((c) => c.includes("월 단위의 복귀")));
});

test("DAU/WAU 의 기간 전체는 끝난 칸의 평균 — 기간을 한 창으로 세면 분모가 기간 전체 고유라 다른 지표가 된다", () => {
  const s = buildSeries({
    spec: spec("week", "2026-09-28", "2026-10-15"), through: "20261013", today: TODAY,
    cells: [full({ ga4: ga4({ dau_wau: 20 }) }), full({ ga4: ga4({ dau_wau: 25 }) }), full({ ga4: ga4({ dau_wau: 60 }) })], // 셋째는 진행 중
    total: full({ ga4: ga4({ dau_wau: 6.5 }) }),
  });
  assert.deepEqual(seriesRow(s, "stickiness")!.total, { v: 22.5, why: "주 2개 평균" });
  assert.ok(s.caveats.some((c) => c.includes("DAU/WAU 는 끝난 칸의 평균")));
});

test("일 단위 끈적함은 기간 한 창이라 이름이 창 길이를 따른다 — 4주를 DAU/WAU 라 부르지 않는다", () => {
  const name = (start: string, end: string) =>
    seriesRow(buildSeries({ spec: spec("day", start, end), through: "20261013", today: TODAY, cells: Array.from({ length: Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1 }, () => full()), total: full({ ga4: ga4({ dau_wau: 6.5 }) }) }), "stickiness")!;
  const four = name("2026-09-14", "2026-10-11");
  assert.equal(four.label, "DAU/MAU");
  assert.equal(four.total.v, 6.5); // 일 단위는 칸 값이 없어 기간 한 창으로 센다
  assert.equal(name("2026-10-05", "2026-10-11").label, "DAU/WAU");
  assert.equal(name("2026-09-28", "2026-10-11").label, "DAU ÷ 14일 활성");
});

test("쿠폰 7일 사용률 — 받은 쿠폰 중 7일 안에 쓴 비율, 지켜보는 중이면 흐리게", () => {
  const s = buildSeries({
    spec: spec("day", "2026-10-09", "2026-10-11"), through: "20261013", today: TODAY,
    cells: [
      full({ use: use({ organic: line(40, 6) }) }),
      full({ use: use({ organic: line(0, 0) }) }),
      full({ use: use({ organic: line(12, 1), maturing: 5 }) }),
    ],
    total: full({ use: use({ organic: line(52, 7), maturing: 5 }) }),
  });
  const r = seriesRow(s, "use_organic_rate")!;
  assert.deepEqual(r.cells[0], { v: 15, n: 40, x: 6 });
  assert.deepEqual(r.cells[1], { v: null, why: "발급 없음", n: 0 });
  assert.deepEqual(r.cells[2], { v: 8.3, n: 12, x: 1, weak: true, why: "지켜보는 중 5장" });
  assert.equal(r.total.v, 13.5);
});

test("사용 시도 성공률의 기간 전체는 값 있는 칸의 성공 합 ÷ 결과 합(S6)", () => {
  const s = buildSeries({
    spec: spec("week", "2026-08-31", "2026-09-20"), through: "20261013", today: TODAY,
    cells: [
      full({ coupons: coupons({ coverage: { wallet_to_use: "full", redeem_outcome: "partial" } }) }), // 실패 이벤트 9/7 전
      full({ coupons: coupons({ attempt: { attempts: 20, ok: 18, failed: 2, rate: 90, reasons: [] } }) }),
      full({ coupons: coupons({ attempt: { attempts: 15, ok: 12, failed: 3, rate: 80, reasons: [] } }) }),
    ],
    total: full(),
  });
  const r = seriesRow(s, "redeem_success")!;
  assert.equal(r.cells[0].why, "이벤트 중간 배포(9/7~)");
  assert.equal(r.total.v, 85.7); // 30 / 35
  assert.match(r.total.why!, /값 있는 2칸 합/);
});

test("매장 상세 → 그 자리 쿠폰은 세션 기준(S35) — 위 두 줄의 비율", () => {
  const s = buildSeries({ spec: spec("week", "2026-10-05", "2026-10-11"), through: "20261013", today: TODAY, cells: [full()], total: full() });
  assert.deepEqual(seriesRow(s, "store_to_coupon")!.cells[0], { v: 10, n: 40, x: 4 });
});

test("제외 목록(D9) — 테스트 계정은 백엔드가 계정째 빼므로 9/7 칸에서 또 덜지 않고, 제외 목록에는 적는다", () => {
  const s = buildSeries({
    spec: spec("week", "2026-08-31", "2026-09-13"), through: "20261013", today: TODAY,
    cells: [full({ db: db({ coupon_redeemed: 5 }) }), full({ db: db({ coupon_redeemed: 4 }) })],
    total: full(),
  });
  const r = seriesRow(s, "coupon_used")!;
  assert.deepEqual(r.cells.map((c) => c.v), [5, 4]); // 9/7 이 든 둘째 칸도 받은 값 그대로
  assert.equal(r.cells[1].why, undefined);
  assert.equal(r.total.v, 9);
  assert.deepEqual(s.exclusions, [ACCOUNT_EXCLUSION]);
});

test("계약 매장(D8) — Astro 분모 · 활동 비율 · 계약일 빈 매장, 0건 매장은 보조표로. 못 읽음과 백엔드 반영 전을 가른다", () => {
  const cs = { count: 20, active: 12, undated: 3, inactive: [{ restaurant_id: 9, name: "가게A", semester_active: true, vacation_active: false }] };
  const s = buildSeries({
    spec: spec("week", "2026-10-05", "2026-10-18"), through: "20261020", today: TODAY,
    cells: [full({ db: { ...db({ coupon_redeemed: 1 }), contract_stores: cs } }), full({ db: { ...db({ coupon_redeemed: 1 }), contract_stores: null } })],
    total: full(),
  });
  assert.deepEqual(seriesRow(s, "contract_stores")!.cells.map((c) => c.v), [20, null]);
  assert.deepEqual(seriesRow(s, "contract_active_rate")!.cells[0], { v: 60, n: 20, x: 12 }); // 전수라 「표본 n」 흐림 없음
  assert.equal(seriesRow(s, "contract_active_rate")!.cells[1].why, "못 셈");
  assert.equal(seriesRow(s, "contract_undated")!.cells[0].v, 3);
  assert.deepEqual(s.long.filter((l) => l.table === IDLE_STORES_TABLE).map((l) => l.dim), ["가게A · 방학 쉼"]);
  // 키가 아예 없으면 백엔드가 아직 안 나간 것
  assert.equal(seriesRow(s, "contract_stores")!.total.why, "백엔드 미반영");
});

test("칸 수가 안 맞으면 멈춘다", () => {
  assert.throws(() => buildSeries({ spec: spec("week", "2026-10-05", "2026-10-11"), through: null, today: TODAY, cells: [], total: full() }), /칸 수/);
});

test("원본 CSV — metric_id · 집계방식 · 사건 첫 줄 · 분모 줄 · 메타 끝(S1 · S2 · S3 · S5)", () => {
  const events = [...FIXED_EVENTS, ...campaignEvents([{ kind: "coupon_week", label: "한정쿠폰 주간", start: "2026-10-12", end: "2026-10-18" }])];
  const s = buildSeries({
    spec: spec("week", "2026-09-28", "2026-10-11"), through: "20261013", today: TODAY, generatedAt: "2026-10-15 12:00",
    cells: [full({ ga4: null }), full()], total: full(), events, eventsOk: true, dbAt: "2026-10-15 11:59", revision: "abc1234",
  });
  const csv = seriesCsv(s);
  const lines = csv.split("\r\n");
  assert.ok(lines[0].startsWith("﻿metric_id,묶음,지표,단위,출처,집계방식,세는 단위,2026-09-28~2026-10-04,2026-10-05~2026-10-11,기간 전체,기간 전체 분모,빈칸 사유,흐린 칸,정의"));
  assert.match(lines[1], /^events,사건,/);
  assert.match(lines[1], /개천절 연휴\(10\/5 대체휴일\) · 한글날 연휴/);
  assert.match(lines.find((l) => l.startsWith("active,"))!, /^active,앱 이용,활성 기기 \(고유\),대,GA4,칸 안 고유,기기,,100,/);
  assert.match(lines.find((l) => l.startsWith("open_to_store__n,"))!, /,분모,세션,,400,/);
  assert.match(lines.find((l) => l.startsWith("active,"))!, /,못 읽음,/); // 빈칸 사유
  assert.ok(lines.some((l) => l.startsWith("meta.generated_at,메타,생성 시각(KST),,,,,2026-10-15 12:00")));
  assert.ok(lines.some((l) => l.startsWith("meta.revision,메타,리비전,,,,,abc1234")));
  assert.ok(lines.some((l) => l.startsWith("meta.db_at,메타,DB 기준 시각(KST),,,,,2026-10-15 11:59")));
  // 정의에 쉼표가 들어간 행은 따옴표로 감싼다
  assert.ok(lines.some((l) => /,"[^"]*,[^"]*"$/.test(l)));

  const html = renderRawReport(s, "<div data-preview-bar></div>");
  assert.match(html, /<title>앱 지표 원본 2026\.9\.28 ~ 10\.11 · 주 단위 2칸<\/title>/);
  assert.match(html, /<td class="na" title="못 읽음">–<\/td>/);
  assert.match(html, /생성 2026-10-15 12:00 KST · GA4 확정 2026-10-13까지 · DB 기준 2026-10-15 11:59 · 리비전 abc1234/);
  assert.match(html, /마일리지 회차 요약/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test("보조표 CSV — 실패 사유 · 쿠폰 종류 · 회차를 한 장에(S7 · S9 · S11)", () => {
  const s = buildSeries({
    spec: spec("week", "2026-09-28", "2026-10-04"), through: "20261013", today: TODAY, generatedAt: "2026-10-15 12:00",
    cells: [full({ coupons: coupons({ attempt: { attempts: 3, ok: 1, failed: 2, rate: 33, reasons: [{ reason: "http_403", n: 2 }] }, stampFail: [{ reason: "too_soon", n: 1 }], bySource: [{ source: "welcome", campaign: false, issued: 5, redeemed: 1 }] }) })],
    total: full(),
    rounds: [{ id: 1, title: "9월 4회차", prize_label: "10,000원", status: "DRAWN", closes_at: "2026-09-30T11:00:00+09:00", drawn_at: null, entries: 0, entrants: 0, points: 0, winners: 0, voucher_redeemed: 0 }],
  });
  const csv = longCsv(s);
  assert.match(csv, /쿠폰 사용 실패 사유\(GA4\),2026-09-28~2026-10-04,http_403,건,2/);
  assert.match(csv, /스탬프 적립 실패 사유\(GA4\),2026-09-28~2026-10-04,too_soon,건,1/);
  assert.match(csv, /쿠폰 종류별\(GA4 발급 경로, 같은 칸\)",2026-09-28~2026-10-04,welcome,발급,5/);
  assert.match(csv, /마일리지 회차\(DB\),2026-09-30,"9\/30 마감 · 9월 4회차 · 10,000원",응모,0/);
});

test("평시 주 — 고정 기준선(9/1~14) 뒤, 사건 없는 주만, 확정 테이블 안에서", () => {
  const events = [...FIXED_EVENTS, ...campaignEvents([
    { kind: "mileage_2x", label: "마일리지 2배 주간", start: "2026-09-21", end: "2026-09-27" },
    { kind: "mileage_2x", label: "마일리지 2배 주간", start: "2026-09-28", end: "2026-10-04" },
    { kind: "coupon_week", label: "한정쿠폰 주간", start: "2026-10-12", end: "2026-10-18" },
    { kind: "mileage_2x", label: "마일리지 2배 주간", start: "2026-10-19", end: "2026-10-25" },
  ])];
  // 10/5~11 은 개천절 대체휴일 · 한글날이 걸려 평시가 아니다. 10/26~11/1 · 11/2~8 만 평시
  assert.deepEqual(calmWeeks(events, true, "20261115", "20261110").map((w) => w.start), ["20261026", "20261102"]);
  // 캠페인 표를 못 읽었으면 평시 주를 고르지 않는다 — 캠페인 주를 평시로 착각하지 않게
  assert.deepEqual(calmWeeks(events, false, "20261115", "20261110"), []);
});

test("매장 상세 이벤트(5/5~) 전에 걸친 칸은 0 이 아니라 「계측 전」", () => {
  const s = buildSeries({
    spec: spec("week", "2026-04-27", "2026-05-17"), through: "20261013", today: TODAY,
    cells: [full({ ga4: ga4({ sessions_with_detail: 0, open_to_store: 0 }) }), full(), full()],
    total: full(),
  });
  const cells = seriesRow(s, "open_to_store")!.cells;
  assert.equal(cells[0].why, "계측 전(5/5~)"); // 4/27~5/3
  assert.equal(cells[1].why, "이벤트 중간 배포(5/5~)"); // 5/4~5/10 — 5/5 에 생겼다
  assert.equal(cells[2].v, 10);
  assert.equal(seriesRow(s, "store_to_coupon")!.cells[0].v, null);
  assert.equal(seriesRow(s, "sessions")!.cells[0].v, 400); // 세션은 그대로 센다
});

test("앱 2.6.0 이벤트 — 생기기 전 칸은 「계측 전」, 게시 2주 · 보급 50% 전 칸은 흐리게(D6)", () => {
  const s = buildSeries({
    spec: spec("week", "2026-10-05", "2026-11-01"), through: "20261102", today: "20261103",
    cells: [
      full(),
      full({ ga4: ga4({ list_view: { seen: 120, clicked: 9 }, app_v260: { devices: 40, active: 100 } }), coupons: coupons({ claim: { claimed: 30, redeemed: 3, rate: 10 } }) }),
      full({ ga4: ga4({ app_v260: { devices: 55, active: 100 } }), coupons: coupons({ claim: { claimed: 40, redeemed: 4, rate: 10 } }) }),
      full({ ga4: ga4({ app_v260: { devices: 60, active: 100 } }), coupons: coupons({ claim: { claimed: 40, redeemed: 8, rate: 20 } }) }),
    ],
    total: full(),
  });
  const cells = (k: string) => seriesRow(s, k)!.cells;
  assert.equal(cells("coupon_claimed")[0].why, "계측 전(10/12~)"); // 10/5~10/11 — 받기는 10/12 에 생겼다
  assert.equal(cells("list_ctr")[0].why, "이벤트 중간 배포(10/11~)"); // 노출은 10/11 에 먼저 보였다
  assert.deepEqual(cells("coupon_claimed")[1], { v: 30, weak: true, why: "게시 2주 전 · 보급 40%" });
  assert.deepEqual(cells("list_ctr")[1], { v: 7.5, n: 120, x: 9, weak: true, why: "게시 2주 전 · 보급 40%" });
  // 10/19~25 는 보급 55% 를 넘었지만 게시 2주(10/26)가 안 됐다 — 둘 다 넘어야 한다
  assert.deepEqual(cells("coupon_claimed")[2], { v: 40, weak: true, why: "게시 2주 전 · 보급 55%" });
  assert.deepEqual(cells("coupon_claimed")[3], { v: 40 });
  assert.deepEqual(cells("app_v260").map((c) => c.v), [null, 40, 55, 60]);
});

test("받기 · 목록 노출 — 0 이면 「없음」, 못 읽었으면 「못 셈」", () => {
  const s = buildSeries({
    spec: spec("day", "2026-10-12", "2026-10-13"), through: "20261014", today: TODAY,
    cells: [
      full({ ga4: ga4({ list_ctr: null, list_view: { seen: 0, clicked: 0 } }), coupons: coupons({ claim: { claimed: 0, redeemed: 0, rate: null } }) }),
      full(), // 받기·노출 값을 안 실은 응답
    ],
    total: full(),
  });
  const cell = (k: string, i: number) => seriesRow(s, k)!.cells[i];
  assert.equal(cell("coupon_claimed", 0).v, 0);
  assert.equal(cell("claim_to_use", 0).why, "받기 없음");
  assert.equal(cell("list_ctr", 0).why, "노출 이벤트 없음");
  assert.equal(cell("coupon_claimed", 1).why, "못 셈");
  assert.equal(cell("claim_to_use", 1).why, "못 셈");
  assert.equal(cell("list_ctr", 1).why, "못 셈");
});
