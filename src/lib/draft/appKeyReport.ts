import { FOLLOW_DAYS } from "@/lib/bigquery/couponFunnel";
import { dashed, rangeLabel, type RangeUnit } from "./appRange";
import { barChart, legend, lineChart, sparkline, SERIES_1, SERIES_2, type ChartFrame, type ChartSeries } from "./appCharts";
import { bold, esc, fmtCell, fmtNum, page } from "./appRangePage";
import { SMALL_SAMPLE } from "./appReportData";
import { seriesRow, type AppSeries, type Cell, type SeriesKind, type SeriesRow } from "./appSeriesData";

/**
 * Probe · **앱 주요 지표 보고서** — 중요한 지표만, 글보다 그래프로(민찬 1015).
 *
 * 「지표 원본」과 같은 칸(AppSeries)을 읽는다 — 같은 기간이면 두 보고서의 숫자가 늘 같다.
 * 묶음은 민찬이 고른 넷: 이용(활성 기기 · 가입) · 쿠폰(사용 · 발급 · 받기 · 사용률) · 스탬프·마일리지 · 전환·재방문.
 * 받기와 목록 카드 클릭은 앱 2.6.0 이벤트라 10/12 앞 칸은 비어 있다(1015 추가).
 *
 * 위 KPI 여섯 칸은 **마지막으로 끝난 칸**의 값과 그 앞 칸 대비 증감이다(주 단위면 지난주 · 전주 대비).
 * 진행 중인 칸을 앞 칸과 견주면 늘 줄어 보여서 쓰지 않는다. 표본이 얕거나 활성 기기의 구성이 크게 달라진 칸은
 * 색을 칠하지 않는다 — 주간 보고서와 같은 규칙(첫 실행 비중 25%p).
 *
 * 일 단위는 하루가 아니라 **마지막 7일**을 묶어 그 앞 7일과 견준다(1016 기획팀 검토). 일요일 하루를 토요일과 견주니
 * 주말엔 쿠폰·스탬프가 0 인 날이 많아 헤드라인이 0 으로 차고, 한 자리 수가 0 이 된 것을 「▼ 100%」 빨강으로 칠했다.
 */

export const PREV: Record<RangeUnit, string> = { day: "전날", week: "전주", month: "전월" };
/** 활성 기기의 구성(처음 온 기기 비중)이 이만큼 달라지면 두 칸을 그대로 견줄 수 없다 — appReportData returningBase 와 같은 값 */
const MIX_SHIFT = 0.25;
/** KPI 가 묶는 칸 수 — 일 단위는 7일. 하루치는 요일에 흔들린다(평일과 주말 활성이 크게 다르다, 1016 검토) */
const KPI_SPAN: Record<RangeUnit, number> = { day: 7, week: 1, month: 1 };
/** 비율이 이만큼(%p)도 안 바뀌면 색을 칠하지 않는다 — 판정 유보가 아니라 「거의 그대로」(민찬 1016) */
const RATE_FLAT = 1;
/**
 * 건수 차이가 우연 범위 안이면 판정 유보(민찬 1016 「더 엄격하게」). 같은 빈도로 일어나는 일을 두 번 세면
 * 두 값의 차이는 대략 ±2√(두 값의 합) 안에서 흔들린다(포아송, 약 95%). 그보다 작은 차이는 늘었다/줄었다로 읽지 않는다.
 */
const NOISE_Z = 2;

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
.kpi .kh{font-size:11px;color:var(--mut);margin-top:6px}
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
/** 위 여섯 칸 — 슬랙 주간·월간 게시의 본문 여섯 줄도 이것이다(민찬 1015) */
export const KEY_KPIS: { key: string; label: string }[] = [
  { key: "active", label: "활성 기기" },
  { key: "signups", label: "가입" },
  { key: "coupon_used", label: "쿠폰 사용" },
  { key: "stamp_earned", label: "스탬프 적립" },
  { key: "open_to_store", label: "앱 열기 → 매장 상세" },
  { key: "retention_w1", label: "가입 1주 후 복귀" },
];

/**
 * 일 단위 7일 묶음에서 칸을 합치는 법. 고유 기기는 날마다 더하면 겹치니 하루 평균,
 * 비율은 칸 비율의 평균이 아니라 분자 ÷ 분모를 다시 센다(세션 가중 — 「기간 전체」 열과 같은 셈).
 */
const SPAN_AVG = new Set(["active", "returning", "new_devices"]);
const SPAN_NUM: Record<string, string> = { open_to_store: "detail_sessions" };

const md = (d: string) => `${+d.slice(4, 6)}/${+d.slice(6, 8)}`;

export const isGa4Row = (r: SeriesRow) => r.source === "ga4" || r.source === "firebase";

/**
 * 그 칸이 **이 행에서** 아직 안 끝났나. GA4 는 확정 테이블이 칸 끝까지 왔나, DB 는 칸 끝이 오늘(KST)보다 앞인가.
 * 월요일 오전엔 DB 는 지난주를 다 셌지만 GA4 일요일분은 아직이다 — 한데 묶으면 DB 칸까지 지난주를 못 쓴다.
 */
export function cellOpen(s: AppSeries, r: SeriesRow, i: number): boolean {
  if (isGa4Row(r)) return s.buckets[i].open;
  return s.buckets[i].end >= s.generatedAt.slice(0, 10).replace(/-/g, "");
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

export interface KpiFacts {
  key: string;
  /** 일 단위 묶음이면 「· 하루 평균」 「· 7일 합」이 붙는다 */
  label: string;
  row: SeriesRow;
  /** 보여 줄 칸(묶음이면 마지막 칸). null 이면 칸마다 못 세는 지표라 기간 전체 값으로 대신한다(일 단위의 복귀 등) */
  i: number | null;
  /** 묶음의 첫 칸 — 묶지 않았으면 i 와 같다 */
  from: number | null;
  /** 값의 꼴 — 하루 평균으로 묶은 활성은 avg */
  kind: SeriesKind;
  cell: Cell;
  open: boolean;
  /** 앞 칸 대비 — 진행 중이거나 앞 칸이 비면 null */
  delta: { text: string; tone: "up" | "down" | "" } | null;
  /** 견준 앞 칸의 이름 — 「전주」 「앞 7일」 */
  prevName: string;
  /** 색을 빼고 판정을 미룬 까닭 — 없으면 "" */
  hold: string;
}

/**
 * 칸 여럿을 하나로 — 건수는 합, 고유 기기는 하루 평균, 비율은 분자 ÷ 분모. 한 칸이면 그 칸 그대로.
 * `base` 는 판정에 쓰는 크기다 — 건수는 합(하루 평균이면 기기·일 합), 비율은 분모.
 */
function combine(s: AppSeries, r: SeriesRow, idx: number[]): { cell: Cell; base: number | null } {
  if (idx.length === 1) {
    const c = r.cells[idx[0]];
    return { cell: c, base: r.kind === "rate" ? c.n ?? null : c.v };
  }
  if (r.kind === "rate") {
    const numRow = SPAN_NUM[r.key] ? seriesRow(s, SPAN_NUM[r.key]) : null;
    if (!numRow) return { cell: { v: null, why: "묶어 셀 수 없음" }, base: null };
    let num = 0, den = 0;
    for (const k of idx) {
      const c = r.cells[k], x = numRow.cells[k].v;
      if (c.v === null && c.n === 0) continue; // 그날 분모 0 — 0/0 은 묶음에 아무것도 더하지 않는다
      if (c.v === null || c.n === undefined || x === null) return { cell: { v: null, why: c.why ?? "못 셈" }, base: null };
      num += x;
      den += c.n;
    }
    if (!den) return { cell: { v: null, why: "표본 없음", n: 0 }, base: 0 };
    const v = Math.round((num / den) * 1000) / 10;
    return { cell: den < SMALL_SAMPLE ? { v, n: den, weak: true, why: `표본 ${den}` } : { v, n: den }, base: den };
  }
  const miss = idx.map((k) => r.cells[k]).find((c) => c.v === null);
  if (miss) return { cell: { v: null, why: miss.why ?? "못 셈" }, base: null };
  const sum = idx.reduce((a, k) => a + (r.cells[k].v as number), 0);
  return { cell: { v: SPAN_AVG.has(r.key) ? Math.round((sum / idx.length) * 10) / 10 : sum }, base: sum };
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);

/**
 * KPI 한 칸의 사실. `focus` 를 주면 그 칸(슬랙 게시 — 「10월 2주차」를 말하는 글이라 그 주에 묶는다),
 * 안 주면 **마지막으로 끝난 칸**(진행 중인 칸을 앞 칸과 견주면 늘 줄어 보인다). 일 단위는 거기서 거꾸로 7일을 묶는다.
 *
 * 색을 빼는 경우(판정 유보) — 주간 보고서와 같은 규칙에 1016 검토 둘을 더했다.
 *  - 비율의 분모가 30 미만
 *  - 건수도 견준 두 값의 합이 30 미만 — 한 자리 수가 0 이 된 것을 「▼ 100%」 빨강으로 칠했다
 *  - 건수 차이가 우연 범위(±2√합) 안 — 합이 30 을 넘어도 두세 건 차이를 초록·빨강으로 칠하지 않는다
 * 판정 유보는 아니지만 비율이 1%p 미만으로 바뀐 칸도 색을 칠하지 않는다.
 *  - 활성 기기의 처음 온 기기 비중이 25%p 넘게 달라짐. 단 두 값 모두 30 이상일 때만 — 열 남짓한 칸에서 서너 대 차이로 걸렸다
 */
export function kpiFacts(s: AppSeries, key: string, label: string, focus?: number): KpiFacts | null {
  const r = seriesRow(s, key);
  if (!r) return null;
  const unit = s.spec.unit;
  let i: number | null = focus ?? null;
  let span = 1;
  if (focus === undefined && r.cells.some((c) => c.v !== null)) {
    // 묶음은 마지막으로 끝난 칸에서 거꾸로 — 빈 날도 묶음에 넣는다(못 읽은 날을 건너뛰면 7일이 아니다)
    if (KPI_SPAN[unit] > 1) for (let k = r.cells.length - 1; k >= 0 && i === null; k--) if (!cellOpen(s, r, k)) { i = k; span = KPI_SPAN[unit]; }
    for (let k = r.cells.length - 1; k >= 0 && i === null; k--) if (!cellOpen(s, r, k) && r.cells[k].v !== null) i = k;
    for (let k = r.cells.length - 1; k >= 0 && i === null; k--) if (r.cells[k].v !== null) i = k;
  }
  if (i === null) return { key, label, row: r, i: null, from: null, kind: r.kind, cell: r.total, open: false, delta: null, prevName: PREV[unit], hold: "" };

  const from = Math.max(0, i - span + 1);
  const cur = range(from, i);
  const prevIdx = from - span >= 0 ? range(from - span, from - 1) : null;
  const kind: SeriesKind = span > 1 && SPAN_AVG.has(key) ? "avg" : r.kind;
  const lab = span > 1 ? `${label} · ${SPAN_AVG.has(key) ? "하루 평균" : r.kind === "rate" ? `${cur.length}일` : `${cur.length}일 합`}` : label;
  const prevName = span > 1 ? `앞 ${span}일` : PREV[unit];

  const a = combine(s, r, cur);
  const b = prevIdx ? combine(s, r, prevIdx) : null;
  const open = cellOpen(s, r, i);
  let d = open || !b ? null : delta(r, a.cell, b.cell);
  let hold = "";
  if (d && (a.cell.weak || b?.cell.weak)) hold = "표본이 얕습니다";
  else if (d && r.kind !== "rate" && a.base !== null && b?.base != null) {
    const sum = a.base + b.base;
    const noise = NOISE_Z * Math.sqrt(sum);
    if (sum < SMALL_SAMPLE) hold = `건수가 적습니다 — 견준 두 값의 합 ${fmtNum(sum, "count")}`;
    // 하루 평균으로 묶은 활성은 기기·일 합으로 재고, 범위는 보이는 값(하루 평균)으로 적는다
    else if (Math.abs(a.base - b.base) < noise) hold = `차이가 우연 범위(±${fmtNum(kind === "avg" ? Math.round((noise / cur.length) * 10) / 10 : Math.round(noise), kind)}) 안입니다`;
  }
  if (d && !hold && r.kind === "rate" && a.cell.v !== null && b?.cell.v != null && Math.abs(a.cell.v - b.cell.v) < RATE_FLAT) d = { ...d, tone: "" };
  if (d && !hold && key === "active" && prevIdx) {
    // 설치가 몰린 칸과 그렇지 않은 칸은 「같은 사람들이 더/덜 왔다」로 읽으면 안 된다 — 색을 빼고 다시 온 기기로 적는다
    const nw = seriesRow(s, "new_devices"), rt = seriesRow(s, "returning");
    const na = nw ? combine(s, nw, cur).base : null, nb = nw ? combine(s, nw, prevIdx).base : null;
    const ab = a.base, bb = b?.base;
    if (ab && bb && na != null && nb != null && Math.min(ab, bb) >= SMALL_SAMPLE && Math.abs(na / ab - nb / bb) >= MIX_SHIFT) {
      const ra = rt ? combine(s, rt, cur).cell.v : null, rb = rt ? combine(s, rt, prevIdx).cell.v : null;
      hold = ra != null && rb != null ? `처음 온 기기 비중이 크게 달라 같은 조건이 아닙니다 — 다시 온 기기 ${fmtNum(rb, kind)} → ${fmtNum(ra, kind)}명` : "처음 온 기기 비중이 크게 달라 같은 조건이 아닙니다";
    }
  }
  if (d && hold) d = { ...d, tone: "" };
  return { key, label: lab, row: r, i, from, kind, cell: a.cell, open, delta: d, prevName, hold };
}

function kpi(s: AppSeries, f: KpiFacts | null): string {
  if (!f) return "";
  const r = f.row;
  const unit = r.unit;
  const totalHint = r.total.v === null ? "" : r.kind === "rate" ? `기간 전체 ${fmtNum(r.total.v, "rate")}%` : f.key === "active" ? `기간 전체 고유 ${fmtNum(r.total.v, "count")}${unit}` : `기간 합계 ${fmtNum(r.total.v, "count")}${unit}`;

  // 칸마다 못 세는 지표(일 단위의 복귀 등) — 기간 전체 값을 대신 크게
  if (f.i === null) {
    const why = r.cells.find((c) => c.why)?.why ?? "값 없음";
    const v = r.total.v === null ? "–" : `${fmtCell(r.total, r.kind)}<small>${esc(unit)}</small>`;
    return `<div class="kpi"><p class="kl">${esc(f.label)}</p><p class="kv">${v}</p><p class="kd">${r.total.v === null ? "" : "기간 전체"}<span>${esc(why)}</span></p><p class="kh">${esc(rangeLabel(s.spec))}</p></div>`;
  }

  const d = f.delta;
  const span = f.from !== null && f.from !== f.i;
  const when = `${span ? `${md(s.buckets[f.from as number].start)}~${md(s.buckets[f.i].end)}` : s.buckets[f.i].label}${f.open ? " · 진행 중" : ""}`;
  const value = f.cell.v === null ? "–" : `${fmtCell(f.cell, f.kind)}<small>${esc(unit)}</small>`;
  const sub = d
    ? `${esc(d.text)}<span>${esc(f.prevName)} 대비${f.hold ? " · 판정 유보" : ""}</span>`
    : `<span>${f.cell.v === null ? esc(f.cell.why ?? "값 없음") : f.open ? "아직 끝나지 않은 칸" : `${esc(f.prevName)} 값 없음`}</span>`;
  return `<div class="kpi" title="${esc(r.note)}">
  <p class="kl">${esc(f.label)}</p>
  <p class="kv">${value}</p>
  <p class="kd${d?.tone ? ` ${d.tone}` : ""}"${f.hold ? ` title="${esc(f.hold)}"` : ""}>${sub}</p>
  <div class="sp">${sparkline(r.cells.map((c, i) => (cellOpen(s, r, i) ? null : c.v)))}</div>
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

export interface KeyReportOpts {
  /** 머리 칩 — 기본 「Probe · 앱 주요 지표」 */
  chip?: string;
  /** 제목 — 기본 「앱 주요 지표 보고서」. 슬랙 게시는 「앱 지표 주간 보고서 · 10월 2주차」 */
  title?: string;
  /** KPI 를 이 칸에 묶는다 — 슬랙 게시는 그 주·그 달 */
  focus?: number;
}

export function renderKeyReport(s: AppSeries, bar: string, opts: KeyReportOpts = {}): string {
  const u = s.spec.unit;
  const stick = seriesRow(s, "stickiness")?.label ?? (u === "month" ? "DAU/MAU" : "DAU/WAU");
  const stickSub = u === "day"
    ? `% · 기간의 하루 평균 활성 ÷ 기간 ${s.spec.days}일 고유 기기 — 주 단위 DAU/WAU(20% 기준)와 다른 값(GA4)`
    : u === "week"
      ? "% · 하루 평균 활성 ÷ 그 주 활성 — 20% 를 넘으면 습관(GA4)"
      : "% · 하루 평균 활성 ÷ 그 달 활성 — 분모가 한 달이라 주 단위보다 훨씬 낮습니다(GA4)";
  const through = s.through ? `GA4 ${dashed(s.through)}까지` : "GA4 미연결";
  const facts = KEY_KPIS.map((k) => kpiFacts(s, k.key, k.label, opts.focus));
  const spanned = facts.find((f) => f && f.i !== null && f.from !== f.i);
  const fromTotal = facts.filter((f) => f && f.i === null).map((f) => f!.label);
  const anyOpen = s.buckets.some((b) => b.open);
  const kpiNote = opts.focus !== undefined
    ? `**위 여섯 칸은 ${s.buckets[opts.focus]?.label ?? "이 칸"}의 값**이고, 그 앞 칸(${PREV[u]}) 대비입니다.`
    : spanned && spanned.i !== null && spanned.from !== null
      ? `**위 여섯 칸은 마지막 7일(${md(s.buckets[spanned.from].start)}~${md(s.buckets[spanned.i].end)})의 합계**(활성은 하루 평균, 비율은 7일을 한 번에 센 값)이고, 그 앞 7일 대비입니다 — 하루치는 요일에 크게 흔들려 묶었습니다.`
      : `**위 여섯 칸은 마지막으로 끝난 칸의 값**이고, 그 앞 칸(${PREV[u]}) 대비입니다.`;

  const body = `
<header class="head">
  <span class="chip">${esc(opts.chip ?? "Probe · 앱 주요 지표")}</span>
  <h1>${esc(opts.title ?? "앱 주요 지표 보고서")}</h1>
  <p class="sub">${esc(rangeLabel(s.spec))} · ${esc(through)} · 만든 시각 ${esc(s.generatedAt)}</p>
</header>
${s.warnings.length ? `<div class="warn"><b>읽지 못한 값이 있습니다</b><ul>${s.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
<div class="kpis">
  ${facts.map((f) => kpi(s, f)).join("\n  ")}
</div>
${section("이용", "학생이 앱을 켜는가, 새로 오는가 돌아오는가", [
  activeChart(s),
  single(s, "signups", "가입", "명 · 새로 만든 계정(DB)", "bar", true),
])}
${section("쿠폰", "받은 쿠폰이 매장에서 쓰이는가", [
  single(s, "coupon_used", "쿠폰 사용", "건 · 매장에서 사용 처리된 날 기준(DB)", "bar"),
  single(s, "coupon_issued", "쿠폰 발급", "건 · 발급된 쿠폰, 취소 제외(DB)", "bar"),
  single(s, "coupon_claimed", "쿠폰 받기", "장 · 학생이 「받기」를 눌러 받은 쿠폰, 자동 지급 제외 · 앱 2.6.0~(GA4)", "bar"),
  single(s, "claim_to_use", "받은 쿠폰 → 사용", "% · 「받기」로 받은 쿠폰 중 같은 칸 안에 쓰인 비율(GA4)", "line"),
  // 일 단위에서 「같은 칸 안에」 센 사용률은 받은 날 당일 것만 남는다 — 받은 날부터 7일을 따라간 값으로(1016 검토)
  u === "day"
    ? single(s, "use_organic_rate", "쿠폰 사용률 (캠페인 외)", `% · 가입 환영·스탬프 보상·추천 등 그날 받은 쿠폰 중 받은 뒤 ${FOLLOW_DAYS}일 안에 쓰인 비율(GA4)`, "line", true)
    : single(s, "coupon_rate_organic", "쿠폰 사용률 (캠페인 외)", "% · 가입 환영·스탬프 보상·추천 등 그 칸에 받은 쿠폰 중 같은 칸 안에 쓰인 비율(GA4)", "line", true),
])}
${section("스탬프 · 마일리지", "재방문 장치가 도는가", [
  single(s, "stamp_earned", "스탬프 적립", "건 · 찍은 횟수, 한 번에 여러 개도 1건(DB)", "bar"),
  single(s, "mileage_entries", "마일리지 응모", "건 · 래플 응모(DB)", "bar"),
])}
${section("전환 · 재방문", "앱을 켠 사람이 매장으로 가고, 다시 오는가", [
  single(s, "open_to_store", "앱 열기 → 매장 상세", "% · 앱 열기 세션 중 매장 상세를 연 비율(GA4)", "line"),
  single(s, "list_ctr", "매장 목록 카드 → 클릭", "% · 목록에서 보인 카드 중 누른 비율 · 앱 2.6.0~(GA4)", "line"),
  single(s, "retention_w1", "가입 1주 후 복귀", "% · 첫 실행 기기 중 7~13일째 다시 켠 비율(Firebase)", "line"),
  single(s, "stickiness", stick, stickSub, "line"),
])}
<section class="card"><h2>읽는 법</h2><ul class="notes">${[
    `${kpiNote}${fromTotal.length ? ` 「${fromTotal.join("」 · 「")}」 칸은 칸마다 못 세는 지표라 기간 전체 값입니다.` : ""} 비율의 분모나 견준 두 건수의 합이 30 미만이거나, 건수 차이가 우연 범위(±2√두 값의 합) 안이거나, 처음 온 기기 비중이 크게 달라진 칸은 색을 칠하지 않습니다(판정 유보). 비율이 1%p 미만으로 바뀐 칸도 색 없이 둡니다.`,
    "**막대 바닥의 얇은 회색 선은 0**, **칸 높이 전체의 옅은 회색 띠는 못 센 칸**입니다. 선이 끊긴 곳도 0 이 아니라 값이 없는 칸입니다(표본 없음 · 못 읽음 · 이벤트 없던 기간). 그래프에 마우스를 올리면 값과 이유가, 「표로 보기」에 숫자가 있습니다.",
    `${anyOpen ? "**옅은 막대**는 아직 끝나지 않은 칸(＊), " : ""}**속 빈 점**은 표본 30 미만인 칸입니다.${anyOpen ? " 비율의 선은 끝나지 않은 칸을 긋지 않습니다." : ""}`,
    "**기기 단위**입니다 — 재설치하면 새 기기로 셉니다. 모든 지표와 정의는 같은 기간의 「지표 원본」 보고서에 있습니다.",
  ].map((c) => `<li>${bold(c)}</li>`).join("")}</ul></section>
<p class="foot">우주라이크 · Probe 앱 주요 지표 · 내부 자료</p>`;

  return page({ title: `앱 주요 지표 ${rangeLabel(s.spec)}`, css: CSS, bar, body, wrapWidth: 960 });
}
