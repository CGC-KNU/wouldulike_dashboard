import { test } from "node:test";
import assert from "node:assert/strict";
import { renderKeyReport } from "../src/lib/draft/appKeyReport";
import { buildSeries } from "../src/lib/draft/appSeriesData";
import { slackLines, slackMessage, slackRange } from "../src/lib/draft/appSlackReport";
import { db, full, ga4, TODAY } from "./_appSeriesFixtures";

/** #sat-probe 앱 지표 주간·월간 게시 — 주요 지표 보고서 + KPI 여섯 줄(1015). 숫자는 지어낸 것이다. */

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

function weekSeries(through: string, generatedAt = "2026-10-12 12:00") {
  const r = slackRange("weekly", "20261011", "20261012");
  if (!r.ok) throw new Error(r.error);
  const cells = r.spec.buckets.map(() => full());
  cells[10] = full({ db: db({ signups: 10, coupon_redeemed: 4, stamp_earned: 20 }) });
  cells[11] = full({ ga4: ga4({ wau: 90, new_devices: 18 }), db: db({ signups: 12, coupon_redeemed: 2, stamp_earned: 20 }) });
  return buildSeries({ spec: r.spec, through, today: "20261012", generatedAt, cells, total: full() });
}

test("본문 여섯 줄 — 그 주에 묶고, 첨부 KPI 와 같은 값", () => {
  const s = weekSeries("20261011");
  const lines = slackLines(s, true);
  assert.deepEqual(lines.map((l) => l.label), ["활성 기기", "가입", "쿠폰 사용", "스탬프 적립", "앱 열기 → 매장 상세", "가입 1주 후 복귀"]);
  const msg = slackMessage({ type: "weekly", label: "10월 2주차", range: { start: "2026-10-05", end: "2026-10-11" }, lines, ready: true, through: "20261011", warnings: [], link: "https://app.wouldulike.kr/r/app/key?x" });
  assert.match(msg, /^:bar_chart: \*앱 지표 주간 보고서 · 10월 2주차\* \(10\/5~10\/11\)\n/);
  assert.match(msg, /• 활성 기기 \*90명\* · 전주 대비 ▼ 10%/);
  assert.match(msg, /• 가입 \*12명\* · 전주 대비 ▲ 20%/);
  assert.match(msg, /• 쿠폰 사용 \*2건\* · 전주 대비 ▼ 50%/);
  assert.match(msg, /• 스탬프 적립 \*20건\* · 전주 대비 변화 없음/);
  assert.match(msg, /• 앱 열기 → 매장 상세 \*10%\* · 전주 대비 변화 없음/);
  assert.match(msg, /첨부: 최근 12주 그래프 HTML · <https:\/\/app\.wouldulike\.kr\/r\/app\/key\?x\|대시보드에서 열기>$/);
  assert.doesNotMatch(msg, /집계 중|undefined|NaN/);

  // 첨부 보고서의 KPI 도 같은 주
  const html = renderKeyReport(s, "", { title: "앱 지표 주간 보고서 · 10월 2주차", focus: 11 });
  assert.match(html, /<h1>앱 지표 주간 보고서 · 10월 2주차<\/h1>/);
  const tile = html.split('<div class="kpi"').find((t) => t.includes('<p class="kl">가입</p>'))!;
  assert.match(tile, /<p class="kv">12<small>명/);
  assert.doesNotMatch(html, /<script/);
});

test("GA4 가 일요일분을 아직 안 보냈으면 GA4 줄만 「집계 중」, DB 줄은 그대로 전주 대비", () => {
  const s = weekSeries("20261010"); // 일요일 테이블이 아직 없다
  const lines = slackLines(s, false);
  const msg = slackMessage({ type: "weekly", label: "10월 2주차", range: { start: "2026-10-05", end: "2026-10-11" }, lines, ready: false, through: "20261010", warnings: [], link: "L" });
  assert.match(msg, /• 활성 기기 — 집계 중/);
  assert.match(msg, /• 앱 열기 → 매장 상세 — 집계 중/);
  assert.match(msg, /• 가입 1주 후 복귀 — 집계 중/);
  // DB 는 그 주를 다 셌다 — GA4 가 늦다고 DB 의 전주 대비까지 빼지 않는다
  assert.match(msg, /• 가입 \*12명\* · 전주 대비 ▲ 20%/);
  assert.match(msg, /_GA4 가 10\/11 데이터를 아직 안 보냈습니다 — 첨부의 GA4 칸은 10\/10까지 센 값입니다._/);
});

test("판정 유보 · 못 읽음 · 경고가 많을 때", () => {
  const s = weekSeries("20261011");
  const lines = slackLines(s, true).map((l) => (l.key === "stamp_earned" ? { ...l, value: null, delta: null, why: "못 읽음" } : l.key === "retention_w1" ? { ...l, hold: "표본이 얕습니다" } : l));
  const msg = slackMessage({ type: "weekly", label: "10월 2주차", range: { start: "2026-10-05", end: "2026-10-11" }, lines, ready: true, through: "20261011", warnings: ["가", "나", "다", "라", "마"], link: "L" });
  assert.match(msg, /• 스탬프 적립 — 읽지 못함\n/);
  assert.match(msg, /_\(판정 유보 — 표본이 얕습니다\)_/);
  assert.equal((msg.match(/:warning:/g) ?? []).length, 4);
  assert.match(msg, /:warning: 외 2건/);
});

test("월간 — 제목과 비교 기준이 바뀐다", () => {
  const r = slackRange("monthly", "2026-09", TODAY);
  if (!r.ok) throw new Error(r.error);
  const cells = r.spec.buckets.map(() => full());
  cells[4] = full({ db: db({ signups: 40, coupon_redeemed: 10, stamp_earned: 30 }) });
  cells[5] = full({ db: db({ signups: 50, coupon_redeemed: 15, stamp_earned: 30 }) });
  const s = buildSeries({ spec: r.spec, through: "20261013", today: TODAY, cells, total: full() });
  const msg = slackMessage({ type: "monthly", label: "2026년 9월", range: { start: "2026-09-01", end: "2026-09-30" }, lines: slackLines(s, true), ready: true, through: "20261013", warnings: [], link: "L" });
  assert.match(msg, /^:bar_chart: \*앱 지표 월간 보고서 · 2026년 9월\*\n/);
  assert.match(msg, /• 쿠폰 사용 \*15건\* · 전월 대비 ▲ 50%/);
  assert.match(msg, /첨부: 최근 6개월 그래프 HTML/);
});
