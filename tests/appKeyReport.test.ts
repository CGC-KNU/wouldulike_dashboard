import { test } from "node:test";
import assert from "node:assert/strict";
import { barChart, lineChart, niceMax, sparkline, SERIES_1, SERIES_2 } from "../src/lib/draft/appCharts";
import { renderKeyReport } from "../src/lib/draft/appKeyReport";
import { buildSeries } from "../src/lib/draft/appSeriesData";
import { db, full, ga4, spec, TODAY } from "./_appSeriesFixtures";

/** 앱 주요 지표 보고서 — 서버에서 그린 SVG 와 KPI 판정(1015). 숫자는 지어낸 것이다. */

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

test("KPI 는 마지막으로 끝난 칸과 그 앞 칸 — 진행 중인 칸과 견주지 않는다", () => {
  const s = buildSeries({
    spec: spec("week", "2026-09-28", "2026-10-15"), through: "20261013", today: TODAY, generatedAt: "2026-10-15 12:00",
    cells: [
      full({ db: db({ signups: 40, coupon_redeemed: 40, stamp_earned: 20 }) }),
      full({ db: db({ signups: 80, coupon_redeemed: 20, stamp_earned: 20 }) }),
      full({ db: db({ signups: 1, coupon_redeemed: 0, stamp_earned: 1 }) }), // 진행 중
    ],
    total: full(),
  });
  const html = renderKeyReport(s, "");
  const tile = (label: string) => html.split('<div class="kpi"').find((t) => t.includes(`<p class="kl">${label}</p>`))!;
  assert.match(tile("가입"), /<p class="kv">80<small>명/);
  assert.match(tile("가입"), /class="kd up"[^>]*>▲ 100%<span>전주 대비/);
  assert.match(tile("쿠폰 사용"), /class="kd down"[^>]*>▼ 50%/);
  assert.match(tile("스탬프 적립"), /변화 없음/);
  assert.match(tile("가입"), /기간 합계 121명/);
  // 비율은 %p
  assert.match(tile("앱 열기 → 매장 상세"), /변화 없음|%p/);
});

test("건수도 견준 두 값의 합이 30 미만이면 색을 빼고 판정 유보 — 한 자리 수가 0 이 된 것을 「▼ 100%」 빨강으로 칠하지 않는다", () => {
  const s = buildSeries({
    spec: spec("week", "2026-09-28", "2026-10-11"), through: "20261013", today: TODAY, generatedAt: "2026-10-15 12:00",
    cells: [full({ db: db({ signups: 8, coupon_redeemed: 7, stamp_earned: 12 }) }), full({ db: db({ signups: 0, coupon_redeemed: 6, stamp_earned: 30 }) })],
    total: full(),
  });
  const html = renderKeyReport(s, "");
  const tile = (label: string) => html.split('<div class="kpi"').find((t) => t.includes(`<p class="kl">${label}</p>`))!;
  assert.match(tile("가입"), /class="kd" title="건수가 적습니다 — 견준 두 값의 합 8">▼ 100%<span>전주 대비 · 판정 유보/);
  assert.match(tile("쿠폰 사용"), /class="kd" title="건수가 적습니다[^"]*">▼ 14.3%/);
  assert.match(tile("스탬프 적립"), /class="kd up"[^>]*>▲ 150%/); // 12 + 30 = 42 — 판정한다
  assert.doesNotMatch(html, /class="kd down"/);
});

test("건수 차이가 우연 범위(±2√합) 안이면 판정 유보 — 합이 30 을 넘어도 두세 건 차이는 칠하지 않는다", () => {
  const s = buildSeries({
    spec: spec("week", "2026-09-28", "2026-10-11"), through: "20261013", today: TODAY, generatedAt: "2026-10-15 12:00",
    cells: [
      full({ ga4: ga4({ wau: 100, new_devices: 20 }), db: db({ signups: 16, coupon_redeemed: 50, stamp_earned: 12 }) }),
      full({ ga4: ga4({ wau: 112, new_devices: 22 }), db: db({ signups: 20, coupon_redeemed: 20, stamp_earned: 12 }) }),
    ],
    total: full(),
  });
  const html = renderKeyReport(s, "");
  const tile = (label: string) => html.split('<div class="kpi"').find((t) => t.includes(`<p class="kl">${label}</p>`))!;
  // 16 → 20: 차이 4, 범위 ±12
  assert.match(tile("가입"), /class="kd" title="차이가 우연 범위\(±12\) 안입니다">▲ 25%<span>전주 대비 · 판정 유보/);
  // 100 → 112: 차이 12, 범위 ±29
  assert.match(tile("활성 기기"), /class="kd" title="차이가 우연 범위\(±29\) 안입니다">▲ 12%/);
  // 50 → 20: 차이 30, 범위 ±17 — 판정한다
  assert.match(tile("쿠폰 사용"), /class="kd down"[^>]*>▼ 60%/);
  assert.match(html, /건수 차이가 우연 범위\(±2√두 값의 합\) 안이거나/);
});

test("비율이 1%p 미만으로 바뀌면 색을 칠하지 않는다 — 판정 유보는 아니다", () => {
  const s = buildSeries({
    spec: spec("week", "2026-09-28", "2026-10-11"), through: "20261013", today: TODAY,
    cells: [full({ ga4: ga4({ open_to_store: 34.3 }) }), full({ ga4: ga4({ open_to_store: 33.9 }) })],
    total: full(),
  });
  const tile = renderKeyReport(s, "").split('<div class="kpi"').find((t) => t.includes('<p class="kl">앱 열기 → 매장 상세</p>'))!;
  assert.match(tile, /<p class="kd">▼ 0.4%p<span>전주 대비<\/span>/);
  assert.doesNotMatch(tile, /판정 유보/);
  // 1%p 이상은 그대로 칠한다
  const t2 = buildSeries({
    spec: spec("week", "2026-09-28", "2026-10-11"), through: "20261013", today: TODAY,
    cells: [full({ ga4: ga4({ open_to_store: 34.3 }) }), full({ ga4: ga4({ open_to_store: 33.3 }) })],
    total: full(),
  });
  assert.match(renderKeyReport(t2, "").split('<div class="kpi"').find((t) => t.includes('<p class="kl">앱 열기 → 매장 상세</p>'))!, /class="kd down"[^>]*>▼ 1%p/);
});

test("처음 온 기기 비중 규칙은 두 값 모두 30 이상일 때만 — 작은 칸끼리의 구성비로 판정을 미루지 않는다", () => {
  const s = buildSeries({
    spec: spec("week", "2026-09-28", "2026-10-11"), through: "20261013", today: TODAY,
    cells: [full({ ga4: ga4({ wau: 20, new_devices: 0 }) }), full({ ga4: ga4({ wau: 40, new_devices: 30 }) })],
    total: full(),
  });
  const html = renderKeyReport(s, "");
  const tile = html.split('<div class="kpi"').find((t) => t.includes('<p class="kl">활성 기기</p>'))!;
  assert.match(tile, /class="kd up"[^>]*>▲ 100%/);
  assert.doesNotMatch(tile, /판정 유보/);
});

test("처음 온 기기 비중이 크게 달라진 칸끼리는 색을 빼고 다시 온 기기로 적는다", () => {
  const s = buildSeries({
    spec: spec("week", "2026-09-14", "2026-09-27"), through: "20261013", today: TODAY,
    cells: [full({ ga4: ga4({ wau: 250, new_devices: 160 }) }), full({ ga4: ga4({ wau: 95, new_devices: 10 }) })],
    total: full(),
  });
  const html = renderKeyReport(s, "");
  const tile = html.split('<div class="kpi"').find((t) => t.includes('<p class="kl">활성 기기</p>'))!;
  assert.match(tile, /class="kd" title="처음 온 기기 비중이 크게 달라 같은 조건이 아닙니다 — 다시 온 기기 90 → 85명"/);
  assert.match(tile, /판정 유보/);
});

test("일 단위 — 칸마다 못 세는 복귀는 기간 전체 값을 대신 보여 준다", () => {
  const s = buildSeries({
    spec: spec("day", "2026-10-05", "2026-10-11"), through: "20261013", today: TODAY,
    cells: Array.from({ length: 7 }, () => full()),
    total: full({ ga4: ga4({ retention_w1: 15 }) }),
  });
  const html = renderKeyReport(s, "");
  const tile = html.split('<div class="kpi"').find((t) => t.includes('<p class="kl">가입 1주 후 복귀</p>'))!;
  assert.match(tile, /<p class="kv">15<small>%/);
  assert.match(tile, /기간 전체<span>일 단위 없음/);
  assert.match(html, /— 일 단위 없음 · 기간 전체 15%/);
  // 7일뿐이라 견줄 앞 7일이 없다 — 전날과 견주지 않는다
  assert.match(html, /앞 7일 값 없음/);
  assert.doesNotMatch(html, /전날 대비/);
  assert.match(html, /「가입 1주 후 복귀」 칸은 칸마다 못 세는 지표라 기간 전체 값입니다/);
  assert.doesNotMatch(html, /NaN|undefined/);
});

test("일 단위 KPI 는 마지막 7일을 묶어 앞 7일과 견준다 — 건수는 합, 활성은 하루 평균, 비율은 분자 ÷ 분모", () => {
  const day = (signups: number, stamp: number, wau: number, nw: number, sessions: number, detail: number) =>
    full({ db: db({ signups, coupon_redeemed: 1, stamp_earned: stamp }), ga4: ga4({ wau, new_devices: nw, sessions, sessions_with_detail: detail, open_to_store: Math.round((detail / sessions) * 1000) / 10 }) });
  const s = buildSeries({
    spec: spec("day", "2026-09-28", "2026-10-11"), through: "20261013", today: TODAY, generatedAt: "2026-10-15 12:00",
    cells: [
      ...Array.from({ length: 7 }, () => day(2, 3, 20, 2, 30, 6)),
      ...Array.from({ length: 7 }, () => day(6, 0, 10, 1, 30, 9)),
    ],
    total: full(),
  });
  const html = renderKeyReport(s, "");
  const tile = (label: string) => html.split('<div class="kpi"').find((t) => t.includes(`<p class="kl">${label}</p>`))!;
  // 가입 42 vs 14 — 차이 28 이 우연 범위(±15)를 넘는다
  assert.match(tile("가입 · 7일 합"), /<p class="kv">42<small>명/);
  assert.match(tile("가입 · 7일 합"), /class="kd up"[^>]*>▲ 200%<span>앞 7일 대비/);
  assert.match(tile("가입 · 7일 합"), /10\/5~10\/11/);
  // 스탬프 0 vs 21 — 합 21, 판정 유보
  assert.match(tile("스탬프 적립 · 7일 합"), /class="kd" title="건수가 적습니다[^"]*">▼ 100%/);
  // 활성 — 하루 평균 10 vs 20, 처음 온 비중은 같다
  assert.match(tile("활성 기기 · 하루 평균"), /<p class="kv">10<small>명/);
  assert.match(tile("활성 기기 · 하루 평균"), /class="kd down"[^>]*>▼ 50%/);
  // 비율 — 63/210 = 30% vs 42/210 = 20%
  assert.match(tile("앱 열기 → 매장 상세 · 7일"), /<p class="kv">30<small>%/);
  assert.match(tile("앱 열기 → 매장 상세 · 7일"), /class="kd up"[^>]*>▲ 10%p/);
  assert.match(html, /위 여섯 칸은 마지막 7일\(10\/5~10\/11\)의 합계/);
  assert.doesNotMatch(html, /전날 대비|NaN|undefined/);
});

test("일 단위 쿠폰 사용률은 받은 날부터 7일 — 같은 날 안에 쓴 것만 세지 않는다", () => {
  const s = buildSeries({
    spec: spec("day", "2026-10-05", "2026-10-11"), through: "20261013", today: TODAY,
    cells: Array.from({ length: 7 }, () => full()),
    total: full(),
  });
  const card = renderKeyReport(s, "").split('<div class="ch').find((c) => c.includes("<h3>쿠폰 사용률 (캠페인 외)</h3>"))!;
  assert.match(card, /받은 뒤 7일 안에 쓰인 비율/);
  assert.match(card, /<td>10<\/td>/); // 쓰기 퍼널 3/30
  // 주 단위는 그대로 — 같은 칸 안에
  const w = buildSeries({ spec: spec("week", "2026-10-05", "2026-10-11"), through: "20261013", today: TODAY, cells: [full()], total: full() });
  assert.match(renderKeyReport(w, ""), /그 칸에 받은 쿠폰 중 같은 칸 안에 쓰인 비율/);
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
  assert.doesNotMatch(card.split("<details>")[0], />60<\/text>/);
  assert.match(card, /<td>60<\/td>/); // 표에는 있다
});

test("주요 지표 — 쿠폰 받기 · 받은 쿠폰 → 사용 · 매장 목록 카드 → 클릭 그래프가 붙는다", () => {
  const s = buildSeries({
    spec: spec("week", "2026-10-05", "2026-10-18"), through: "20261014", today: TODAY,
    cells: [full(), full({ ga4: ga4({ list_ctr: 7.5, list_view: { seen: 120, clicked: 9 } }) })],
    total: full(),
  });
  const html = renderKeyReport(s, "");
  for (const t of ["쿠폰 받기", "받은 쿠폰 → 사용", "매장 목록 카드 → 클릭"]) assert.match(html, new RegExp(`<h3>${t}</h3>`), t);
  // 쿠폰 묶음 안에, 목록 클릭은 전환 묶음 안에
  const sec = (h: string) => html.split('<section class="sec">').find((x) => x.includes(`<h2>${h}</h2>`))!;
  assert.match(sec("쿠폰"), /<h3>쿠폰 받기<\/h3>/);
  assert.match(sec("전환 · 재방문"), /<h3>매장 목록 카드 → 클릭<\/h3>/);
  assert.doesNotMatch(html, /NaN|undefined/);
});
