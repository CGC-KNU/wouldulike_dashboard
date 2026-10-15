import { dashed, rangeLabel, type RangeUnit } from "./appRange";
import { barChart, legend, lineChart, sparkline, SERIES_1, SERIES_2, type ChartFrame, type ChartSeries } from "./appCharts";
import { bold, esc, fmtCell, fmtNum, page } from "./appRangePage";
import { seriesRow, type AppSeries, type Cell, type SeriesRow } from "./appSeriesData";

/**
 * Probe · **앱 주요 지표 보고서** — 중요한 지표만, 글보다 그래프로(민찬 1015).
 *
 * 「지표 원본」과 같은 칸(AppSeries)을 읽는다 — 같은 기간이면 두 보고서의 숫자가 늘 같다.
 * 묶음은 민찬이 고른 넷: 이용(활성 기기 · 가입) · 쿠폰(사용 · 발급 · 사용률) · 스탬프·마일리지 · 전환·재방문.
 *
 * 위 KPI 여섯 칸은 **마지막으로 끝난 칸**의 값과 그 앞 칸 대비 증감이다(주 단위면 지난주 · 전주 대비).
 * 진행 중인 칸을 앞 칸과 견주면 늘 줄어 보여서 쓰지 않는다. 표본이 얕거나 활성 기기의 구성이 크게 달라진 칸은
 * 색을 칠하지 않는다 — 주간 보고서와 같은 규칙(첫 실행 비중 25%p).
 */

const PREV: Record<RangeUnit, string> = { day: "전날", week: "전주", month: "전월" };
/** 활성 기기의 구성(처음 온 기기 비중)이 이만큼 달라지면 두 칸을 그대로 견줄 수 없다 — appReportData returningBase 와 같은 값 */
const MIX_SHIFT = 0.25;

const CSS = `
.kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:4px}
.kpi{background:#fff;border-radius:16px;border:1px solid rgba(0,0,0,.05);padding:14px 16px 12px;min-width:0}
.kpi .kl{font-size:12px;font-weight:700;color:var(--sub)}
.kpi .kv{font-size:28px;font-weight:800;letter-spacing:-.8px;line-height:1.15;margin-top:6px;color:var(--ink)}
.kpi .kv small{font-size:13px;font-weight:600;color:var(--mut);margin-left:3px;letter-spacing:0}
.kpi .kd{font-size:12px;font-weight:700;margin-top:3px;color:var(--sub)}
.kpi .kd.up{color:var(--good)} .kpi .kd.down{color:var(--bad)}
.kpi .kd span{font-weight:500;color:var(--mut);margin-left:4px}
.kpi .sp{margin-top:8px}
.kpi .kh{font-size:11px;color:var(--mut);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sec{margin-top:22px}
.sec>h2{font-size:16px;font-weight:800;letter-spacing:-.3px;padding:0 4px}
.sec>.desc{font-size:12px;color:var(--sub);padding:2px 4px 0}
.charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:8px}
.ch{background:#fff;border-radius:16px;border:1px solid rgba(0,0,0,.05);padding:14px 14px 10px;min-width:0}
.ch.wide{grid-column:1/-1}
.ch h3{font-size:13.5px;font-weight:800;letter-spacing:-.2px}
.ch .cs{font-size:11.5px;color:var(--sub);margin:1px 0 8px}
.lg{display:flex;gap:12px;flex-wrap:wrap;font-size:11.5px;color:var(--tx);margin:-2px 0 6px}
.lg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
details{margin-top:6px;font-size:11.5px;color:var(--sub)}
details summary{cursor:pointer;list-style:none;font-weight:600}
details summary::-webkit-details-marker{display:none}
details summary::before{content:"▸ ";}
details[open] summary::before{content:"▾ ";}
details table{margin-top:6px;border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
details th,details td{padding:3px 6px;border-bottom:1px solid var(--line2);text-align:right;white-space:nowrap}
details th:first-child,details td:first-child{text-align:left}
details td.na{color:var(--mut)}
@media (max-width:720px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.charts{grid-template-columns:1fr}.ch.wide{grid-column:auto}}
@media print{@page{size:A4;margin:10mm}body{background:#fff}.wrap{padding:0}.sec,.ch,.kpi{break-inside:avoid}details{display:none}}
`;

// ── KPI ────────────────────────────────────────────────────────────
interface Pick { i: number; cell: Cell; open: boolean }

/** 마지막으로 끝난 칸(값이 있는). 없으면 진행 중인 칸이라도 */
function latest(s: AppSeries, r: SeriesRow): Pick | null {
  for (let i = r.cells.length - 1; i >= 0; i--) if (!s.buckets[i].open && r.cells[i].v !== null) return { i, cell: r.cells[i], open: false };
  for (let i = r.cells.length - 1; i >= 0; i--) if (r.cells[i].v !== null) return { i, cell: r.cells[i], open: true };
  return null;
}

function delta(r: SeriesRow, cur: Cell, prev: Cell | undefined): { text: string; tone: "up" | "down" | "" } | null {
  if (!prev || prev.v === null || cur.v === null) return null;
  const d = cur.v - prev.v;
  if (r.kind === "rate") {
    const p = Math.round(d * 10) / 10;
    return { text: p === 0 ? "변화 없음" : `${p > 0 ? "▲" : "▼"} ${Math.abs(p)}%p`, tone: p > 0 ? "up" : p < 0 ? "down" : "" };
  }
  if (prev.v === 0) return { text: cur.v === 0 ? "변화 없음" : "▲ 새로 생김", tone: cur.v === 0 ? "" : "up" };
  const pct = Math.round((d / prev.v) * 1000) / 10;
  return { text: pct === 0 ? "변화 없음" : `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`, tone: pct > 0 ? "up" : pct < 0 ? "down" : "" };
}

function kpi(s: AppSeries, key: string, label: string): string {
  const r = seriesRow(s, key);
  if (!r) return "";
  const at = latest(s, r);
  const unit = r.unit;
  const totalHint = r.total.v === null ? "" : r.kind === "rate" ? `기간 전체 ${fmtNum(r.total.v, "rate")}%` : key === "active" ? `기간 전체 고유 ${fmtNum(r.total.v, "count")}${unit}` : `기간 합계 ${fmtNum(r.total.v, "count")}${unit}`;

  // 칸마다 못 세는 지표(일 단위의 복귀 등) — 기간 전체 값을 대신 크게
  if (!at) {
    const why = r.cells.find((c) => c.why)?.why ?? "값 없음";
    const v = r.total.v === null ? "–" : `${fmtCell(r.total, r.kind)}<small>${esc(unit)}</small>`;
    return `<div class="kpi"><p class="kl">${esc(label)}</p><p class="kv">${v}</p><p class="kd">${r.total.v === null ? "" : "기간 전체"}<span>${esc(why)}</span></p><p class="kh">${esc(rangeLabel(s.spec))}</p></div>`;
  }

  const prev = at.i > 0 ? r.cells[at.i - 1] : undefined;
  let d = at.open ? null : delta(r, at.cell, prev);
  let note = "";
  if (d && (at.cell.weak || prev?.weak)) { d = { ...d, tone: "" }; note = "표본이 얕아 판정하지 않습니다"; }
  if (d && key === "active") {
    // 설치가 몰린 칸과 그렇지 않은 칸은 「같은 사람들이 더/덜 왔다」로 읽으면 안 된다 — 색을 빼고 다시 온 기기로 적는다
    const nw = seriesRow(s, "new_devices"), rt = seriesRow(s, "returning");
    const a = at.cell.v, b = prev?.v, na = nw?.cells[at.i].v, nb = nw?.cells[at.i - 1]?.v;
    if (a && b && na != null && nb != null && Math.abs(na / a - nb / b) >= MIX_SHIFT) {
      d = { ...d, tone: "" };
      const ra = rt?.cells[at.i].v, rb = rt?.cells[at.i - 1]?.v;
      note = ra != null && rb != null ? `처음 온 기기 비중이 크게 달라 같은 조건이 아닙니다 — 다시 온 기기 ${fmtNum(rb, "count")} → ${fmtNum(ra, "count")}명` : "처음 온 기기 비중이 크게 달라 같은 조건이 아닙니다";
    }
  }
  const b = s.buckets[at.i];
  const when = `${b.label}${at.open ? " · 진행 중" : ""}`;
  return `<div class="kpi" title="${esc(r.note)}">
  <p class="kl">${esc(label)}</p>
  <p class="kv">${fmtCell(at.cell, r.kind)}<small>${esc(unit)}</small></p>
  <p class="kd${d?.tone ? ` ${d.tone}` : ""}"${note ? ` title="${esc(note)}"` : ""}>${d ? `${esc(d.text)}<span>${PREV[s.spec.unit]} 대비${note ? " · 판정 유보" : ""}</span>` : `<span>${at.open ? "아직 끝나지 않은 칸" : `${PREV[s.spec.unit]} 값 없음`}</span>`}</p>
  <div class="sp">${sparkline(r.cells.map((c, i) => (s.buckets[i].open ? null : c.v)))}</div>
  <p class="kh">${esc(when)}${totalHint ? ` · ${esc(totalHint)}` : ""}</p>
</div>`;
}

// ── 그래프 카드 ──────────────────────────────────────────────────────
const tip = (s: AppSeries, i: number, text: string) => `${s.buckets[i].label}${s.buckets[i].open ? " (진행 중)" : ""} · ${text}`;
const cellText = (r: SeriesRow, c: Cell) =>
  c.v === null ? `– ${c.why ?? ""}`.trim() : `${fmtCell(c, r.kind)}${r.unit}${c.n !== undefined && r.kind === "rate" ? ` (분모 ${c.n.toLocaleString("ko-KR")})` : ""}${c.weak && c.why ? ` · ${c.why}` : ""}`;

/** 그래프 아래 「표로 보기」 — 색을 못 가리는 사람·인쇄·숫자를 옮겨 적을 때 */
function table(s: AppSeries, rows: { name: string; row: SeriesRow }[]): string {
  const head = `<tr><th>칸</th>${rows.map((r) => `<th>${esc(r.name)}</th>`).join("")}</tr>`;
  const body = s.buckets.map((b, i) => `<tr><td>${esc(b.label)}${b.open ? "＊" : ""}</td>${rows.map((r) => {
    const c = r.row.cells[i];
    return `<td${c.v === null ? ' class="na"' : ""}${c.why ? ` title="${esc(c.why)}"` : ""}>${fmtCell(c, r.row.kind)}</td>`;
  }).join("")}</tr>`).join("");
  const tot = `<tr><td><b>기간 전체</b></td>${rows.map((r) => `<td><b>${fmtCell(r.row.total, r.row.kind)}</b></td>`).join("")}</tr>`;
  return `<details><summary>표로 보기</summary><table>${head}${body}${tot}</table></details>`;
}

const frameOf = (s: AppSeries, r: SeriesRow, title: string, wide: boolean, tips?: string[]): ChartFrame => ({
  labels: s.buckets.map((b) => b.label),
  open: s.buckets.map((b) => b.open),
  kind: r.kind,
  unit: r.unit,
  title,
  width: wide ? 900 : 440,
  height: wide ? 210 : 180,
  tips: tips ?? r.cells.map((c, i) => tip(s, i, cellText(r, c))),
});

/** 칸이 모두 같은 이유로 비었으면(일 단위의 복귀 등) 그 이유를 부제에 */
function emptyWhy(r: SeriesRow): string {
  if (r.cells.some((c) => c.v !== null)) return "";
  const why = r.cells[0]?.why;
  return why && r.cells.every((c) => c.why === why) ? ` — ${why}${r.total.v !== null ? ` · 기간 전체 ${fmtCell(r.total, r.kind)}${r.unit}` : ""}` : "";
}

function single(s: AppSeries, key: string, title: string, sub: string, form: "bar" | "line", wide = false): string {
  const r = seriesRow(s, key);
  if (!r) return "";
  // 비율의 선은 끝나지 않은 칸을 긋지 않는다 — 사흘치 DAU/WAU 는 늘 높게 나와 마지막에 치솟는 선이 된다.
  // 건수 막대는 옅게 그대로 둔다(덜 찬 막대는 덜 찼다고 읽힌다). 값은 「표로 보기」와 원본에 있다.
  const hide = (i: number) => form === "line" && s.buckets[i].open;
  const series: ChartSeries = { name: title, color: SERIES_1, values: r.cells.map((c, i) => (hide(i) ? null : c.v)), weak: r.cells.map((c) => !!c.weak) };
  const f = frameOf(s, r, title, wide, r.cells.map((c, i) => tip(s, i, hide(i) ? "진행 중 — 칸이 끝나면 긋습니다" : cellText(r, c))));
  const chart = form === "bar" ? barChart([series], f) : lineChart(series, f);
  return `<div class="ch${wide ? " wide" : ""}"><h3>${esc(title)}</h3><p class="cs">${esc(sub)}${esc(emptyWhy(r))}</p>${chart}${table(s, [{ name: title, row: r }])}</div>`;
}

/** 활성 기기 = 다시 온 기기 + 처음 온 기기 — 쌓은 막대. 설치가 몰린 칸과 돌아온 사람이 는 칸을 한눈에 가른다 */
function activeChart(s: AppSeries): string {
  const act = seriesRow(s, "active"), ret = seriesRow(s, "returning"), nw = seriesRow(s, "new_devices");
  if (!act || !ret || !nw) return "";
  const series: ChartSeries[] = [
    { name: "다시 온 기기", color: SERIES_1, values: ret.cells.map((c) => c.v) },
    { name: "처음 온 기기", color: SERIES_2, values: nw.cells.map((c) => c.v) },
  ];
  const tips = act.cells.map((c, i) => tip(s, i, c.v === null ? `– ${c.why ?? ""}` : `활성 ${fmtNum(c.v, "count")}명 = 다시 온 ${ret.cells[i].v ?? "–"} + 처음 온 ${nw.cells[i].v ?? "–"}`));
  const f = frameOf(s, act, "활성 기기", true, tips);
  return `<div class="ch wide"><h3>활성 기기</h3><p class="cs">명 · 칸 안에 앱을 켠 기기 — 아래는 전에도 온 기기, 위는 그 칸에 처음 연 기기</p>${legend(series)}${barChart(series, f)}${table(s, [{ name: "활성", row: act }, { name: "다시 온", row: ret }, { name: "처음 온", row: nw }])}</div>`;
}

function section(title: string, desc: string, cards: string[]): string {
  return `<section class="sec"><h2>${esc(title)}</h2><p class="desc">${esc(desc)}</p><div class="charts">${cards.join("")}</div></section>`;
}

export function renderKeyReport(s: AppSeries, bar: string): string {
  const u = s.spec.unit;
  const stick = u === "month" ? "DAU/MAU" : "DAU/WAU";
  const through = s.through ? `GA4 ${dashed(s.through)}까지` : "GA4 미연결";

  const body = `
<header class="head">
  <span class="chip">Probe · 앱 주요 지표</span>
  <h1>앱 주요 지표 보고서</h1>
  <p class="sub">${esc(rangeLabel(s.spec))} · ${esc(through)} · 만든 시각 ${esc(s.generatedAt)}</p>
</header>
${s.warnings.length ? `<div class="warn"><b>읽지 못한 값이 있습니다</b><ul>${s.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
<div class="kpis">
  ${kpi(s, "active", "활성 기기")}
  ${kpi(s, "signups", "가입")}
  ${kpi(s, "coupon_used", "쿠폰 사용")}
  ${kpi(s, "stamp_earned", "스탬프 적립")}
  ${kpi(s, "open_to_store", "앱 열기 → 매장 상세")}
  ${kpi(s, "retention_w1", "가입 1주 후 복귀")}
</div>
${section("이용", "학생이 앱을 켜는가, 새로 오는가 돌아오는가", [
  activeChart(s),
  single(s, "signups", "가입", "명 · 새로 만든 계정(DB)", "bar", true),
])}
${section("쿠폰", "받은 쿠폰이 매장에서 쓰이는가", [
  single(s, "coupon_used", "쿠폰 사용", "건 · 매장에서 사용 처리된 날 기준(DB)", "bar"),
  single(s, "coupon_issued", "쿠폰 발급", "건 · 발급된 쿠폰, 취소 제외(DB)", "bar"),
  single(s, "coupon_rate_organic", "쿠폰 사용률 (캠페인 외)", "% · 가입 환영·스탬프 보상·추천 등 그 칸에 받은 쿠폰 중 쓰인 비율(GA4)", "line", true),
])}
${section("스탬프 · 마일리지", "재방문 장치가 도는가", [
  single(s, "stamp_earned", "스탬프 적립", "건 · 찍은 횟수, 한 번에 여러 개도 1건(DB)", "bar"),
  single(s, "mileage_entries", "마일리지 응모", "건 · 래플 응모(DB)", "bar"),
])}
${section("전환 · 재방문", "앱을 켠 사람이 매장으로 가고, 다시 오는가", [
  single(s, "open_to_store", "앱 열기 → 매장 상세", "% · 앱 열기 세션 중 매장 상세를 연 비율(GA4)", "line"),
  single(s, "retention_w1", "가입 1주 후 복귀", "% · 첫 실행 기기 중 7~13일째 다시 켠 비율(Firebase)", "line"),
  single(s, "stickiness", stick, "% · 하루 평균 활성 ÷ 칸 전체 활성 — 습관의 정도(GA4)", "line", true),
])}
<section class="card"><h2>읽는 법</h2><ul class="notes">${[
    `**위 여섯 칸은 마지막으로 끝난 칸의 값**이고, 그 앞 칸(${PREV[u]}) 대비입니다. 표본이 얕거나 처음 온 기기 비중이 크게 달라진 칸은 색을 칠하지 않습니다.`,
    "**옅은 막대**는 아직 끝나지 않은 칸(＊), **속 빈 점**은 표본 30 미만인 칸입니다. 비율의 선은 끝나지 않은 칸을 긋지 않습니다.",
    "**그래프가 끊긴 곳은 0 이 아니라 못 센 칸**입니다. 그래프에 마우스를 올리면 값과 이유가, 「표로 보기」에 숫자가 있습니다.",
    "**기기 단위**입니다 — 재설치하면 새 기기로 셉니다. 모든 지표와 정의는 위 「지표 원본」 탭에서 같은 기간으로 봅니다.",
  ].map((c) => `<li>${bold(c)}</li>`).join("")}</ul></section>
<p class="foot">우주라이크 · Probe 앱 주요 지표 · 내부 자료</p>`;

  return page({ title: `앱 주요 지표 ${rangeLabel(s.spec)}`, css: CSS, bar, body, wrapWidth: 960 });
}
