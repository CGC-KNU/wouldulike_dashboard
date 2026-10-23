import { test } from "node:test";
import assert from "node:assert/strict";
import { renderKeyReport } from "../src/lib/draft/appKeyReport";
import { campaignEvents, FIXED_EVENTS, type AppEvent } from "../src/lib/draft/appEvents";
import { buildSeries, type Cell } from "../src/lib/draft/appSeriesData";
import { slackLines, slackMessage, slackRange } from "../src/lib/draft/appSlackReport";
import { db, full, ga4, TODAY } from "./_appSeriesFixtures";

/** #sat-probe 앱 지표 주간·월간 게시 — 주요 지표 보고서 + KPI 여섯 줄(1015 · 1022 기획팀 검토). 숫자는 지어낸 것이다. */

test("기간 — 주간은 그 주까지 12주, 월간은 그 달까지 6개월", () => {
  const w = slackRange("weekly", "20261011", TODAY);
  assert.ok(w.ok);
  assert.equal(w.spec.start, "20260720");
  assert.equal(w.spec.end, "20261011");
  assert.equal(w.spec.buckets.length, 12);
  const m = slackRange("monthly", "2026-09", TODAY);
  assert.ok(m.ok);
  assert.deepEqual([m.spec.start, m.spec.end, m.spec.buckets.length], ["20260401", "20260930", 6]);
  // 해를 넘긴다 · 3월 앞으로는 가지 않는다
  const jan = slackRange("monthly", "2027-01", "20270202");
  assert.ok(jan.ok);
  assert.equal(jan.spec.start, "20260801");
  const early = slackRange("monthly", "2026-05", TODAY);
  assert.ok(early.ok);
  assert.equal(early.spec.start, "20260301");
});

const FIXED = [0, 1].map((k) => ({
  start: k ? "20260908" : "20260901", end: k ? "20260914" : "20260907",
  cells: { active: { v: 80 }, new_devices: { v: 20 }, returning: { v: 60 }, dau: { v: 14 }, signups: { v: 10 }, users_redeemed: { v: 8 }, open_to_store: { v: 30, n: 200, x: 60 } } as Record<string, Cell>,
}));

/** 11/2~8 이 그 주 — 사건 없는 주 */
function weekSeries(through: string, o: { events?: AppEvent[]; generatedAt?: string } = {}) {
  const r = slackRange("weekly", "20261108", "20261109");
  if (!r.ok) throw new Error(r.error);
  const cells = r.spec.buckets.map(() => full());
  cells[10] = full({ db: db({ signups: 10, coupon_redeemed: 4, stamp_earned: 20, users_redeemed: 30 }) });
  cells[11] = full({ ga4: ga4({ wau: 90, new_devices: 18, dau: 22 }), db: db({ signups: 12, coupon_redeemed: 2, stamp_earned: 20, users_redeemed: 60 }) });
  return buildSeries({
    spec: r.spec, through, today: "20261109", generatedAt: o.generatedAt ?? "2026-11-09 12:00", cells, total: full(),
    events: o.events ?? FIXED_EVENTS, eventsOk: true, baseline: { fixed: FIXED, weeks: [] },
  });
}

const msgOf = (s: ReturnType<typeof weekSeries>, ready = true, events = "") =>
  slackMessage({ type: "weekly", label: "11월 1주차", range: { start: "2026-11-02", end: "2026-11-08" }, lines: slackLines(s, ready), ready, through: s.through, warnings: [], link: "https://app.wouldulike.kr/r/app/key?x", events });

test("본문 여섯 줄 — 그 주에 묶고 「값 — 평시 값 대비」만, 보조줄 · 전주 대비는 첨부에만(1023 간소화)", () => {
  const s = weekSeries("20261108");
  const lines = slackLines(s, true);
  assert.deepEqual(lines.map((l) => l.label), ["하루 평균 활성 기기", "가입", "매장 이용 계정", "앱 열기 → 매장 상세", "첫 실행 기기 1주 후 복귀", "다시 온 기기"]);
  const msg = msgOf(s);
  assert.match(msg, /^:bar_chart: \*앱 지표 주간 보고서 · 11월 1주차\* \(11\/2~11\/8\)\n/);
  // 22 vs 14 — 기기·일 합 154 vs 98, 우연 범위 ±31 밖
  assert.match(msg, /\n• 하루 평균 활성 기기 \*22대\* — 평시 14대 대비 ▲ 57\.1% · 목표 50대\n/);
  // 가입 12 vs 10 — 합 22 라 참고만. 사유는 한 마디만
  assert.match(msg, /\n• 가입 \*12명\* — 평시 10명 · _판정 유보: 건수가 적어 참고만_\n/);
  assert.match(msg, /\n• 매장 이용 계정 \*60명\* — 평시 8명 대비 ▲ 650%\n/);
  assert.match(msg, /\n_평시: 9\/1~14_\n첨부: 최근 12주 그래프 HTML · <https:\/\/app\.wouldulike\.kr\/r\/app\/key\?x\|대시보드에서 열기>$/);
  assert.doesNotMatch(msg, /전주 대비|직원 제외|그 주 고유|집계 중|undefined|NaN/);

  // 첨부 보고서의 KPI 도 같은 주
  const html = renderKeyReport(s, "", { title: "앱 지표 주간 보고서 · 11월 1주차", focus: 11 });
  assert.match(html, /<h1>앱 지표 주간 보고서 · 11월 1주차<\/h1>/);
  const tile = html.split('<div class="kpi"').find((t) => t.includes('<p class="kl">가입</p>'))!;
  assert.match(tile, /<p class="kv">12<small>명/);
  assert.doesNotMatch(html, /<script/);
});

test("사건 주는 사유를 맨 위 사건 줄에 한 번 — 줄마다 되풀이하지 않는다(1023 간소화)", () => {
  const s = weekSeries("20261108", { events: [...FIXED_EVENTS, ...campaignEvents([{ kind: "coupon_week", label: "한정쿠폰 주간", start: "2026-11-02", end: "2026-11-08" }])] });
  const msg = msgOf(s, true, "한정쿠폰 주간");
  assert.match(msg, /\n_이번 주 사건: 한정쿠폰 주간 — 사건 칸이라 평시와 견주지 않습니다_\n/);
  assert.match(msg, /\n• 하루 평균 활성 기기 \*22대\* — 평시 14대 · 목표 50대\n/);
  assert.match(msg, /\n• 가입 \*12명\* — 평시 10명\n/);
  assert.doesNotMatch(msg, /대비|판정 유보|사건 칸 —/);
});

test("평시 값은 지표 모양대로 — 이번 값이 정수여도 하루 평균 평시 14.4 를 14 로 자르지 않는다", () => {
  const fixed = FIXED.map((w, k) => ({ ...w, cells: { ...w.cells, dau: { v: k ? 14.8 : 14 } } }));
  const r = slackRange("weekly", "20261108", "20261109");
  if (!r.ok) throw new Error(r.error);
  const cells = r.spec.buckets.map(() => full());
  cells[11] = full({ ga4: ga4({ wau: 90, new_devices: 18, dau: 22 }) });
  const s = buildSeries({ spec: r.spec, through: "20261108", today: "20261109", cells, total: full(), events: FIXED_EVENTS, eventsOk: true, baseline: { fixed, weeks: [] } });
  assert.match(msgOf(s), /• 하루 평균 활성 기기 \*22대\* — 평시 14\.4대/);
});

test("GA4 가 일요일분을 아직 안 보냈으면 GA4 줄만 「집계 중」, DB 줄은 그대로", () => {
  const s = weekSeries("20261107"); // 일요일 테이블이 아직 없다
  const msg = slackMessage({ type: "weekly", label: "11월 1주차", range: { start: "2026-11-02", end: "2026-11-08" }, lines: slackLines(s, false), ready: false, through: "20261107", warnings: [], link: "L" });
  assert.match(msg, /• 하루 평균 활성 기기 — 집계 중/);
  assert.match(msg, /• 앱 열기 → 매장 상세 — 집계 중/);
  assert.match(msg, /• 첫 실행 기기 1주 후 복귀 — 집계 중/);
  // DB 는 그 주를 다 셌다 — GA4 가 늦다고 DB 줄까지 빼지 않는다
  assert.match(msg, /• 가입 \*12명\*/);
  assert.match(msg, /_GA4 가 11\/8 데이터를 아직 안 보냈습니다 — 첨부의 GA4 칸은 11\/7까지 센 값입니다._/);
});

test("판정 유보 · 못 읽음 · 경고가 많을 때", () => {
  const s = weekSeries("20261108");
  const lines = slackLines(s, true).map((l) => (l.key === "users_redeemed" ? { ...l, value: null, delta: null, why: "못 읽음" } : l));
  const msg = slackMessage({ type: "weekly", label: "11월 1주차", range: { start: "2026-11-02", end: "2026-11-08" }, lines, ready: true, through: "20261108", warnings: ["가", "나", "다", "라", "마"], link: "L" });
  assert.match(msg, /• 매장 이용 계정 — 읽지 못함\n/);
  assert.equal((msg.match(/:warning:/g) ?? []).length, 4);
  assert.match(msg, /:warning: 외 2건/);
});

test("월간 — 제목이 바뀌고 전월 대비는 싣지 않는다", () => {
  const r = slackRange("monthly", "2026-11", "20261202");
  if (!r.ok) throw new Error(r.error);
  const cells = r.spec.buckets.map(() => full());
  cells[4] = full({ db: db({ signups: 40, users_redeemed: 30 }) });
  cells[5] = full({ db: db({ signups: 50, users_redeemed: 40 }) });
  const s = buildSeries({ spec: r.spec, through: "20261201", today: "20261202", cells, total: full(), events: FIXED_EVENTS, eventsOk: true, baseline: { fixed: FIXED, weeks: [] } });
  const msg = slackMessage({ type: "monthly", label: "2026년 11월", range: { start: "2026-11-01", end: "2026-11-30" }, lines: slackLines(s, true), ready: true, through: "20261201", warnings: [], link: "L" });
  assert.match(msg, /^:bar_chart: \*앱 지표 월간 보고서 · 2026년 11월\*\n/);
  assert.match(msg, /\n• 가입 \*50명\* — 평시 \d+명/);
  assert.doesNotMatch(msg, /전월 대비/);
  // 월 고유 수는 주 기준과 견주지 않는다 — 평시 값 없이 사유 한 마디
  assert.match(msg, /\n• 매장 이용 계정 \*40명\* — _판정 유보: 칸 안 고유 수라 주 기준과 견줄 수 없습니다_\n/);
  assert.match(msg, /첨부: 최근 6개월 그래프 HTML/);
});
