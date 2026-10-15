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
      full({ db: db({ signups: 10, coupon_redeemed: 4, stamp_earned: 20 }) }),
      full({ db: db({ signups: 12, coupon_redeemed: 2, stamp_earned: 20 }) }),
      full({ db: db({ signups: 1, coupon_redeemed: 0, stamp_earned: 1 }) }), // 진행 중
    ],
    total: full(),
  });
  const html = renderKeyReport(s, "");
  const tile = (label: string) => html.split('<div class="kpi"').find((t) => t.includes(`<p class="kl">${label}</p>`))!;
  assert.match(tile("가입"), /<p class="kv">12<small>명/);
  assert.match(tile("가입"), /class="kd up"[^>]*>▲ 20%<span>전주 대비/);
  assert.match(tile("쿠폰 사용"), /class="kd down"[^>]*>▼ 50%/);
  assert.match(tile("스탬프 적립"), /변화 없음/);
  assert.match(tile("가입"), /기간 합계 23명/);
  // 비율은 %p
  assert.match(tile("앱 열기 → 매장 상세"), /변화 없음|%p/);
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
  assert.match(html, /전날 대비/);
  assert.doesNotMatch(html, /NaN|undefined/);
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
