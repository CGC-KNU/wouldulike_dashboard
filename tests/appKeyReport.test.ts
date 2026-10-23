import { test } from "node:test";
import assert from "node:assert/strict";
import { barChart, lineChart, niceMax, sparkline, SERIES_1, SERIES_2 } from "../src/lib/draft/appCharts";
import { KEY_KPIS, kpiFacts, renderKeyReport } from "../src/lib/draft/appKeyReport";
import { campaignEvents, DAU_GOAL, FIXED_EVENTS, type AppEvent } from "../src/lib/draft/appEvents";
import { buildSeries, type BaseWindow, type Cell, type CellInput } from "../src/lib/draft/appSeriesData";
import { db, full, ga4, spec, TODAY } from "./_appSeriesFixtures";

/** 앱 주요 지표 보고서 — 서버에서 그린 SVG 와 KPI 판정(1015 · 1022 기획팀 검토). 숫자는 지어낸 것이다. */

const frame = (n: number, open: boolean[] = []) => ({
  labels: Array.from({ length: n }, (_, i) => `${i + 1}주`),
  open: Array.from({ length: n }, (_, i) => open[i] ?? false),
  kind: "count" as const, unit: "명", title: "시험",
});

test("축 끝은 0 에서 시작하는 깔끔한 값", () => {
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(7), 10);
  assert.equal(niceMax(18), 20);
  assert.equal(niceMax(23), 25);
  assert.equal(niceMax(412), 500);
  assert.equal(niceMax(0.6), 1);
});

test("선은 빈 칸에서 끊는다 — 0 으로 내려 긋지 않는다", () => {
  const svg = lineChart({ name: "비율", color: SERIES_1, values: [5, 6, null, 7] }, { ...frame(4), kind: "rate", unit: "%" });
  const d = svg.match(/<path d="([^"]+)"/)![1];
  assert.equal((d.match(/M/g) ?? []).length, 2);
  assert.equal((svg.match(/<circle/g) ?? []).length, 3);
  assert.doesNotMatch(svg, /NaN|undefined/);
  // 마우스를 올리면 뜨는 값 — 칸마다 하나
  assert.equal((svg.match(/<title>/g) ?? []).length, 4);
});

test("쌓은 막대 — 끝 칸 위에 합계 하나만, 진행 중인 칸은 옅게", () => {
  const svg = barChart(
    [{ name: "다시 온", color: SERIES_1, values: [10, 20, 30] }, { name: "처음 온", color: SERIES_2, values: [5, 5, 40] }],
    frame(3, [false, false, true])
  );
  assert.match(svg, />70<\/text>/); // 끝 칸 합계
  assert.doesNotMatch(svg, />15<\/text>|>25<\/text>/); // 다른 칸에는 숫자를 안 적는다
  assert.match(svg, /fill-opacity="0.45"/);
  assert.doesNotMatch(svg, /NaN|undefined/);
});

test("값이 하나도 없으면 빈 축 대신 말로", () => {
  assert.match(lineChart({ name: "x", color: SERIES_1, values: [null, null] }, frame(2)), /값이 없습니다/);
  assert.equal(sparkline([null, 3]), "");
});

// ── KPI 판정(1022 기획팀 검토) ─────────────────────────────────────
/** 평시 기준선 창 하나 — 주 값 그대로 */
const bw = (start: string, end: string, o: Partial<Record<string, Cell>> = {}): BaseWindow => ({
  start, end,
  cells: {
    active: { v: 80 }, new_devices: { v: 20 }, returning: { v: 60 }, dau: { v: 14 }, signups: { v: 10 },
    users_redeemed: { v: 8 }, open_to_store: { v: 30, n: 200, x: 60 }, coupon_used: { v: 3 }, stamp_earned: { v: 5 },
    ...o,
  } as Record<string, Cell>,
});
const FIXED = [bw("20260901", "20260907"), bw("20260908", "20260914")];

/** 11월 둘째 주까지 두 칸 — 사건 없는 주. 값은 픽스처(full) 그대로: 하루 평균 25 · 가입 7 · 이용 계정 9 · 상세 10%(40/400) · 다시 온 80 */
function nov(o: { events?: AppEvent[]; eventsOk?: boolean; weeks?: BaseWindow[]; fixed?: BaseWindow[]; cells?: CellInput[] } = {}) {
  return buildSeries({
    spec: spec("week", "2026-10-26", "2026-11-08"), through: "20261108", today: "20261110", generatedAt: "2026-11-10 09:00",
    cells: o.cells ?? [full(), full()], total: full(),
    events: o.events ?? FIXED_EVENTS, eventsOk: o.eventsOk ?? true,
    baseline: { fixed: o.fixed ?? FIXED, weeks: o.weeks ?? [] }, dbAt: "2026-11-10 08:59", revision: "abc1234",
  });
}
const fact = (s: ReturnType<typeof nov>, key: string) => kpiFacts(s, key, key)!;

test("KPI 는 평시 기준선 대비로 판정한다 — 앞 칸 대비는 색 없이 참고", () => {
  const s = nov();
  const dau = fact(s, "dau");
  assert.equal(dau.i, 1);
  assert.equal(dau.baseName, "평시(9/1~14)");
  assert.equal(dau.base, 14);
  assert.deepEqual(dau.delta, { text: "▲ 78.6%", tone: "up" }); // 25 vs 14 — 기기·일 합 175 vs 98, 우연 범위 ±33 밖
  assert.equal(dau.hold, "");
  assert.deepEqual(dau.prev, { name: "전주", text: "변화 없음" });
  assert.equal(dau.sub, "그 주 고유 100대 · 목표 50대");
  // 비율은 두 비율 z — 10%(40/400) vs 30%(60/200)
  assert.deepEqual(fact(s, "open_to_store").delta, { text: "▼ 20%p", tone: "down" });
  assert.equal(fact(s, "open_to_store").sub, "분모 세션 400");
  // 가입 7 vs 평시 하루치 × 7 = 10 — 두 값 합 17 이라 참고만
  assert.match(fact(s, "signups").hold, /건수가 적어 참고만 — 두 값 합 17/);
  assert.equal(fact(s, "signups").delta, null);
  // 다시 온 기기 80 vs 60 — 차이 20 < 2√140 ≈ 23.7
  assert.match(fact(s, "returning").hold, /우연 범위/);
  assert.equal(fact(s, "users_redeemed").sub, "쿠폰 3건 · 스탬프 12건");
  // 복귀는 코호트라 평시 기준 없이 본다
  const ret = fact(s, "retention_w1");
  assert.equal(ret.delta, null);
  assert.equal(ret.hold, "");
});

test("사건이 걸린 칸은 모든 카드를 판정 유보 — %·화살표 없이 「이번 vs 평시」와 사유(R2 · R3)", () => {
  const s = nov({ events: [...FIXED_EVENTS, ...campaignEvents([{ kind: "coupon_week", label: "한정쿠폰 주간", start: "2026-11-02", end: "2026-11-08" }])] });
  for (const k of KEY_KPIS.map((x) => x.key).filter((k) => k !== "retention_w1")) {
    assert.equal(fact(s, k).delta, null, k);
    assert.equal(fact(s, k).hold, "사건 칸 — 한정쿠폰 주간", k);
  }
  const html = renderKeyReport(s, "");
  assert.match(html, /<span class="hold">판정 유보<\/span>25대 vs 14대<span>사건 칸 — 한정쿠폰 주간<\/span>/);
  assert.match(html, /<b>이번 칸의 사건<\/b> 한정쿠폰 주간 11\/2~8/);
  assert.doesNotMatch(html.split('<div class="kpis">')[1].split("</div>\n")[0], /▲|▼ /); // 유보 카드엔 화살표가 없다
});

test("캠페인 표를 못 읽으면 판정하지 않는다 — 캠페인 칸을 평시로 착각하지 않게", () => {
  const s = nov({ eventsOk: false });
  assert.match(fact(s, "dau").hold, /캠페인 주간 표를 못 읽어/);
  assert.match(renderKeyReport(s, ""), /캠페인 표를 못 읽었습니다/);
});

test("평시 주가 3주 쌓이면 최근 4주 중앙값으로 바뀐다(D4)", () => {
  const two = nov({ weeks: [bw("20261005", "20261011"), bw("20261019", "20261025")] });
  assert.equal(fact(two, "dau").baseName, "평시(9/1~14)"); // 2주는 모자라 고정 기준선
  const weeks = [bw("20260928", "20261004", { signups: { v: 14 } }), bw("20261005", "20261011", { signups: { v: 21 } }), bw("20261019", "20261025", { signups: { v: 70 } }), bw("20261102", "20261108", { signups: { v: 99 } })];
  const s = nov({ weeks });
  const f = fact(s, "signups");
  assert.equal(f.baseName, "평시 3주 중앙값"); // 칸(11/2~8)보다 앞선 주만 — 11/2~8 자신은 안 쓴다
  assert.equal(f.base, 21);
});

test("비율 카드 우연 검정 — 9월판 같은 ▲ 8.8%p(z ≈ 1.9)는 판정 유보(R1)", () => {
  const cell = full({ ga4: ga4({ sessions: 270, sessions_with_detail: 92 }) }); // 34.1%
  // 평시 27.5%(55/200)
  const s2 = nov({ cells: [cell, cell], fixed: [bw("20260901", "20260907", { open_to_store: { v: 27.5, n: 200, x: 55 } })] });
  const f = fact(s2, "open_to_store");
  assert.equal(f.delta, null);
  assert.match(f.hold, /우연 범위 안입니다\(z 1\.5\)/);
  // 분모가 30 미만이면 참고
  const thin = full({ ga4: ga4({ sessions: 20, sessions_with_detail: 9 }) });
  assert.match(fact(nov({ cells: [thin, thin] }), "open_to_store").hold, /표본이 얕습니다/);
});

test("처음 온 기기 비중이 평시와 25%p 넘게 다르면 판정 유보 — 활성뿐 아니라 가입 · 상세에도(R2)", () => {
  const camp = full({ ga4: ga4({ wau: 100, new_devices: 60 }) });
  const s = nov({ cells: [camp, camp] });
  assert.equal(fact(s, "dau").hold, "처음 온 기기 비중이 평시와 다릅니다(25% → 60%)");
  assert.equal(fact(s, "open_to_store").hold, "처음 온 기기 비중이 평시와 다릅니다(25% → 60%)");
});

test("월 칸의 고유 수(매장 이용 계정 · 다시 온 기기)는 주 기준과 견주지 않는다", () => {
  const s = buildSeries({
    spec: spec("month", "2026-10-01", "2026-11-30"), through: "20261201", today: "20261202",
    cells: [full(), full()], total: full(), events: [], eventsOk: true, baseline: { fixed: FIXED, weeks: [] },
  });
  assert.match(fact(s, "users_redeemed").hold, /칸 안 고유 수라 주 기준과 견줄 수 없습니다\(평시\(9\/1~14\) 주 8\)/);
  // 가입은 하루치 × 30일
  assert.equal(fact(s, "signups").base, 42.9);
});

test("일 단위는 모니터링용 — KPI 대신 기간 합계와 「판정하지 않습니다」(R7)", () => {
  const s = buildSeries({ spec: spec("day", "2026-10-05", "2026-10-11"), through: "20261013", today: TODAY, cells: Array.from({ length: 7 }, () => full()), total: full(), events: FIXED_EVENTS, eventsOk: true });
  const html = renderKeyReport(s, "");
  assert.doesNotMatch(html, /<div class="kpis">/);
  assert.match(html, /일 단위는 캠페인 · 릴리스 모니터링용입니다 — 판정하지 않습니다/);
  assert.match(html, /<b>이 기간의 사건<\/b> 개천절 연휴/);
  assert.doesNotMatch(html, /<h3>DAU/); // 일판엔 끈적함 그래프가 없다(C13)
  assert.doesNotMatch(html, /NaN|undefined/);
});

test("하루 평균 목표(D7)는 일 단위 활성 그래프에만 긋는다 — 주 막대는 그 주 고유 기기라 견줄 수 없다", () => {
  const day = buildSeries({ spec: spec("day", "2026-10-05", "2026-10-11"), through: "20261013", today: TODAY, cells: Array.from({ length: 7 }, () => full()), total: full(), events: FIXED_EVENTS, eventsOk: true });
  const dayHtml = renderKeyReport(day, "");
  assert.match(dayHtml, new RegExp(`>목표 ${DAU_GOAL}</text>`));
  assert.match(dayHtml, new RegExp(`실선은 목표\\(하루 ${DAU_GOAL}대\\)`));
  assert.doesNotMatch(renderKeyReport(nov(), ""), new RegExp(`>목표 ${DAU_GOAL}</text>`));
});

test("주간판 화면 — 데이터 상태 줄 · 새 KPI 여섯 칸 · 2.6.0 묶음 접기 · 회차표 · 「20%」 문구 없음", () => {
  const s = nov();
  const html = renderKeyReport(s, "");
  assert.match(html, /생성 2026-11-10 09:00 KST · GA4 확정 2026-11-08까지 · DB 기준 2026-11-10 08:59 · 리비전 abc1234/);
  for (const k of KEY_KPIS) assert.match(html, new RegExp(`<p class="kl">${k.label}</p>`), k.label);
  assert.match(html, /<details class="fold"><summary>쿠폰 받기 · 받기 누른 쿠폰 → 7일 사용 — 계측 전 · 앱 2\.6\.0~/);
  assert.match(html, /회차 요약을 읽지 못했습니다/);
  assert.match(html, /<h3>DAU\/WAU<\/h3>/);
  assert.doesNotMatch(html, /<h3>매장 목록 카드 → 클릭<\/h3>/); // 원본으로(C11)
  assert.doesNotMatch(html, /<h3>첫 실행 기기 1주 후 복귀<\/h3>/); // 주간판엔 복귀 그래프 없음(C12)
  assert.doesNotMatch(html, /20% /);
  assert.match(html, /<h3>처음 받은 쿠폰<\/h3>/); // 주간판 쿠폰 발급은 GA4(C4)
  assert.doesNotMatch(html, /NaN|undefined/);
});

test("제휴 매장 카드(D8) — KPI 칸의 활동 0건 매장을 적는다. Astro 값(계약일 빈 매장)은 없다. 백엔드 반영 전이면 카드가 없다", () => {
  const af = (idle: string[]) => ({ count: 10, active: 10 - idle.length, inactive: idle.map((name, k) => ({ restaurant_id: k, name })) });
  const s = nov({ cells: [full({ db: { ...db({ users_redeemed: 9 }), affiliate_stores: af([]) } }), full({ db: { ...db({ users_redeemed: 9 }), affiliate_stores: af(["가게A", "가게B"]) } })] });
  const html = renderKeyReport(s, "");
  assert.match(html, /<h3>활동 제휴 매장 비율<\/h3>/);
  assert.match(html, /11\/2~11\/8 활동 0건 제휴 매장 2곳: 가게A, 가게B/);
  assert.doesNotMatch(html, /계약일 빈 매장|Astro 계약/);
  assert.doesNotMatch(renderKeyReport(nov(), ""), /활동 제휴 매장 비율/);
});

test("월간판 — 쿠폰 발급은 월말 스냅샷, 활동 매장 · 복귀 그래프, 앞 달 설치가 몰렸으면 활성 감소 주석(A10)", () => {
  const s = buildSeries({
    spec: spec("month", "2026-09-01", "2026-10-31"), through: "20261101", today: "20261102",
    cells: [full({ ga4: ga4({ wau: 367, new_devices: 228 }) }), full()], total: full(), events: FIXED_EVENTS, eventsOk: true, baseline: { fixed: FIXED, weeks: [] },
    rounds: [{ id: 3, title: "10월 2회차", prize_label: "10,000원", status: "DRAWN", closes_at: "2026-10-09T11:00:00+09:00", drawn_at: null, entries: 0, entrants: 0, points: 0, winners: 0, voucher_redeemed: 0 }],
  });
  const html = renderKeyReport(s, "");
  assert.match(html, /<h3>쿠폰 발급 \(월말 스냅샷\)<\/h3>/);
  assert.match(html, /<h3>활동 매장<\/h3>/);
  assert.match(html, /<h3>첫 실행 기기 1주 후 복귀<\/h3>/);
  assert.match(html, /앞 달\(9월\) 활성 367대 중 228대\(62%\)가 처음 온 기기였습니다/);
  assert.match(html, /10\/9 마감 · 10월 2회차/);
  assert.doesNotMatch(html, /<h3>DAU\/MAU<\/h3>/); // 월간판 끈적함은 원본으로(C13)
});

test("그래프 — 사건 칸은 옅은 금색 띠, 평시 기준선은 점선", () => {
  const svg = barChart([{ name: "가입", color: SERIES_1, values: [3, 5, 4] }], { ...frame(3), marks: [false, true, false], ref: { values: [4, 4, 4], label: "평시" } });
  assert.equal((svg.match(/fill="#FBF1D9"/g) ?? []).length, 1);
  assert.equal((svg.match(/stroke-dasharray="4 3"/g) ?? []).length, 3);
  assert.match(svg, />평시<\/text>/);
});

test("막대 — 0 은 바닥에 얇은 선, 못 센 칸은 회색 띠", () => {
  const svg = barChart([{ name: "가입", color: SERIES_1, values: [3, 0, null, 2] }], frame(4));
  assert.equal((svg.match(/height="2" fill="#9CA3AF"/g) ?? []).length, 1); // 0 인 칸 하나 — 계열 색이 아니라 회색
  assert.equal((svg.match(/fill="#F4F5F8"/g) ?? []).length, 1); // 못 센 칸 하나
  // 모두 비었으면 띠 대신 말로
  const none = barChart([{ name: "가입", color: SERIES_1, values: [null, null] }], frame(2));
  assert.doesNotMatch(none, /#F4F5F8/);
  assert.match(none, /값이 없습니다/);
});

test("비율의 선은 끝나지 않은 칸을 긋지 않는다 — 막대는 옅게 남긴다", () => {
  const s = buildSeries({
    spec: spec("week", "2026-09-28", "2026-10-15"), through: "20261013", today: TODAY,
    cells: [full(), full(), full({ ga4: ga4({ dau_wau: 60 }) })],
    total: full(),
  });
  const html = renderKeyReport(s, "");
  const card = html.split('<div class="ch').find((c) => c.includes("<h3>DAU/WAU</h3>"))!;
  assert.match(card, /진행 중 — 칸이 끝나면 긋습니다/);
  assert.doesNotMatch(card.split('<details class="tb">')[0], />60<\/text>/);
  assert.match(card, /<td>60<\/td>/); // 표에는 있다
});

