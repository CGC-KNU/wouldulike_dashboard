import { esc, fmtNum } from "./appRangePage";

/**
 * 주요 지표 보고서의 그래프 — **서버에서 그린 SVG** 한 벌(막대 · 쌓은 막대 · 선 · 스파크라인).
 *
 * 그래프 라이브러리를 쓰지 않는 까닭: 「HTML 저장」은 스크립트를 걷어 낸 파일이라(슬랙·카톡 뷰어가 스크립트를 안 돌린다)
 * 브라우저에서 그리는 그래프는 빈 상자로 남는다. SVG 는 그대로 남고, 인쇄·PNG 에도 그대로 찍힌다.
 * 칸에 마우스를 올리면 `<title>` 로 값이 뜬다 — 스크립트 없이 도는 툴팁이다. 값은 그래프 아래 「표로 보기」에도 있다.
 *
 * 모양 규칙(dataviz): 막대는 24px 이하 · 위 끝만 4px 둥글게 · 쌓은 조각 사이 2px 틈, 선은 2px, 점은 r 4 에 바탕색 2px 고리,
 * 격자는 실선 1px 옅은 회색, 값 글자는 잉크색(계열 색을 글자에 쓰지 않는다), 숫자는 끝에만 하나.
 * 색은 우주라이크 팔레트 두 칸 — 인디고 #6366E0 · 골드 #E0A23C (색약 검사 통과, 골드는 대비가 낮아 표 보기를 같이 둔다).
 */

export const SERIES_1 = "#6366E0";
export const SERIES_2 = "#E0A23C";
const GRID = "#ECEEF3";
const AXIS_TX = "#9CA3AF";
const INK = "#374151";
const SURFACE = "#FFFFFF";

type Kind = "count" | "avg" | "rate";

export interface ChartSeries {
  name: string;
  color: string;
  values: (number | null)[];
  /** 표본이 얕거나 지켜보는 중 — 속이 빈 점 · 옅은 막대 */
  weak?: boolean[];
}

export interface ChartFrame {
  labels: string[];
  /** 아직 안 끝난 칸 — 옅게 그리고 축 이름에 ＊ */
  open: boolean[];
  kind: Kind;
  unit: string;
  /** 칸마다 마우스를 올렸을 때 뜨는 글 — 없으면 이름 · 값으로 만든다 */
  tips?: string[];
  width?: number;
  height?: number;
  /** 접근성 이름 */
  title: string;
}

/** 0 에서 시작하는 축의 깔끔한 끝 — 1 · 2 · 2.5 · 5 · 10 × 10^n */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** 축 글자 — 만 단위부터 줄인다 */
const tick = (v: number, kind: Kind) => (v >= 10_000 ? `${Math.round(v / 1000) / 10}만` : fmtNum(v, kind === "count" && !Number.isInteger(v) ? "avg" : kind));

interface Geo {
  w: number; h: number; l: number; r: number; t: number; b: number;
  pw: number; ph: number; band: number; n: number; max: number;
  x: (i: number) => number;
  y: (v: number) => number;
}

function geo(f: ChartFrame, max: number): Geo {
  const w = f.width ?? 440, h = f.height ?? 190;
  const l = 38, r = 34, t = 14, b = 24;
  const pw = w - l - r, ph = h - t - b, n = Math.max(1, f.labels.length);
  const band = pw / n;
  const top = niceMax(max);
  return { w, h, l, r, t, b, pw, ph, band, n, max: top, x: (i) => l + band * (i + 0.5), y: (v) => t + ph - (v / top) * ph };
}

/** 격자 · 축 글자 — 0 · 절반 · 끝(건수인데 절반이 소수면 0 · 끝만) */
function frame(g: Geo, f: ChartFrame): string {
  const half = g.max / 2;
  const ticks = f.kind === "count" && !Number.isInteger(half) ? [0, g.max] : [0, half, g.max];
  const lines = ticks.map((v) => `<line x1="${g.l}" x2="${g.w - g.r}" y1="${g.y(v)}" y2="${g.y(v)}" stroke="${GRID}" stroke-width="1"/>` +
    `<text x="${g.l - 6}" y="${g.y(v) + 3.5}" text-anchor="end" font-size="10" fill="${AXIS_TX}">${tick(v, f.kind)}</text>`).join("");
  // 칸이 많으면 이름을 건너뛴다 — 겹치면 아무것도 안 읽힌다. 끝 칸은 늘 적는다
  const every = Math.max(1, Math.ceil(f.labels.length / Math.max(1, Math.floor(g.pw / 58))));
  const xs = f.labels.map((lab, i) => {
    const show = i === f.labels.length - 1 || (i % every === 0 && f.labels.length - 1 - i >= every);
    return show ? `<text x="${g.x(i)}" y="${g.h - 7}" text-anchor="middle" font-size="10" fill="${AXIS_TX}">${esc(lab)}${f.open[i] ? "＊" : ""}</text>` : "";
  }).join("");
  return lines + xs;
}

/** 칸마다 보이지 않는 넓은 사각형에 title — 가는 막대·작은 점을 정확히 짚지 않아도 뜬다 */
function hits(g: Geo, f: ChartFrame, series: ChartSeries[]): string {
  return f.labels.map((lab, i) => {
    const tip = f.tips?.[i] ?? `${lab}${f.open[i] ? " (진행 중)" : ""} · ${series.map((s) => `${s.name} ${s.values[i] === null ? "–" : fmtNum(s.values[i] as number, f.kind) + f.unit}`).join(" · ")}`;
    return `<g><title>${esc(tip)}</title><rect x="${g.l + g.band * i}" y="${g.t}" width="${g.band}" height="${g.ph}" fill="transparent"/></g>`;
  }).join("");
}

/** 위 끝만 둥근 막대 */
function bar(x: number, y: number, w: number, h: number, r: number, color: string, opacity: number): string {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `<path d="M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z" fill="${color}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ""}/>`;
}

/**
 * 폭에 맞춰 줄되 너무 좁아지지는 않게 — 넓은 그래프(900)를 폰 폭(390)에 다 넣으면 축 글자가 4px 이 된다(1015 캡처).
 * 그보다 좁으면 그래프 상자 안에서만 가로로 민다. 페이지 전체는 밀리지 않는다.
 */
const svg = (g: Geo, f: ChartFrame, inner: string) =>
  `<div style="overflow-x:auto"><svg viewBox="0 0 ${g.w} ${g.h}" width="100%" role="img" aria-label="${esc(f.title)}" style="display:block;max-width:${g.w}px;min-width:${g.w > 600 ? 560 : 300}px;overflow:visible">${inner}</svg></div>`;

/** 끝 값 하나 — 표에 없는 것을 그래프에서 읽게 하지 않는다. 숫자는 끝에만 */
const endLabel = (x: number, y: number, v: number, f: ChartFrame, anchor: "start" | "middle" = "middle") =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="11" font-weight="700" fill="${INK}">${fmtNum(v, f.kind)}</text>`;

/**
 * 막대. 계열이 둘 이상이면 **쌓는다**(아래부터 순서대로) — 활성 기기 = 다시 온 기기 + 처음 온 기기.
 * 끝 칸 위에 합계 하나만 적는다.
 */
export function barChart(series: ChartSeries[], f: ChartFrame): string {
  const totals = f.labels.map((_, i) => {
    const vs = series.map((s) => s.values[i]);
    return vs.some((v) => v === null) ? (vs.every((v) => v === null) ? null : vs.reduce<number>((a, v) => a + (v ?? 0), 0)) : vs.reduce<number>((a, v) => a + (v as number), 0);
  });
  const g = geo(f, Math.max(0, ...totals.map((v) => v ?? 0)));
  const bw = Math.max(2, Math.min(24, g.band * 0.62));
  let marks = "";
  totals.forEach((_, i) => {
    let base = 0;
    const x = g.x(i) - bw / 2;
    const parts = series.map((s) => ({ s, v: s.values[i] })).filter((p) => p.v !== null && (p.v as number) > 0);
    parts.forEach((p, k) => {
      const v = p.v as number;
      const y0 = g.y(base), y1 = g.y(base + v);
      const top = k === parts.length - 1;
      // 위에 조각이 더 있으면 2px 바탕색 틈을 남긴다 — 테두리 대신 틈이 조각을 가른다
      const h = y0 - y1 - (top ? 0 : Math.min(2, (y0 - y1) / 2));
      const y = top ? y1 : y1 + (y0 - y1 - h);
      const op = f.open[i] || p.s.weak?.[i] ? 0.45 : 1;
      marks += top ? bar(x, y, bw, h, 4, p.s.color, op) : `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${p.s.color}"${op < 1 ? ` fill-opacity="${op}"` : ""}/>`;
      base += v;
    });
  });
  const last = totals.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop();
  const label = last === undefined ? "" : endLabel(g.x(last), g.y(totals[last] as number) - 6, totals[last] as number, f);
  const empty = last === undefined ? `<text x="${g.l + g.pw / 2}" y="${g.t + g.ph / 2}" text-anchor="middle" font-size="12" fill="${AXIS_TX}">값이 없습니다</text>` : "";
  return svg(g, f, frame(g, f) + marks + label + empty + hits(g, f, series));
}

/** 선 하나 — 빈 칸에서 끊는다(0 으로 내려 긋지 않는다). 얕은 표본·진행 중 칸은 속 빈 점 */
export function lineChart(s: ChartSeries, f: ChartFrame): string {
  const vals = s.values;
  const g = geo(f, Math.max(0, ...vals.map((v) => v ?? 0)));
  let d = "";
  let pen = false;
  vals.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${g.x(i).toFixed(1)},${g.y(v).toFixed(1)}`;
    pen = true;
  });
  const path = d ? `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : "";
  const dots = vals.map((v, i) => {
    if (v === null) return "";
    const hollow = f.open[i] || s.weak?.[i];
    return `<circle cx="${g.x(i)}" cy="${g.y(v)}" r="4" fill="${hollow ? SURFACE : s.color}" stroke="${hollow ? s.color : SURFACE}" stroke-width="2"/>`;
  }).join("");
  const last = vals.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop();
  const label = last === undefined ? "" : endLabel(g.x(last) + 8, g.y(vals[last] as number) + 4, vals[last] as number, f, "start");
  const empty = last === undefined ? `<text x="${g.l + g.pw / 2}" y="${g.t + g.ph / 2}" text-anchor="middle" font-size="12" fill="${AXIS_TX}">값이 없습니다</text>` : "";
  return svg(g, f, frame(g, f) + path + dots + label + empty + hits(g, f, [s]));
}

/** KPI 칸 아래 작은 추이 — 축 없이, 마지막 점만 진하게 */
export function sparkline(values: (number | null)[], opts: { width?: number; height?: number; color?: string } = {}): string {
  const w = opts.width ?? 120, h = opts.height ?? 28, pad = 3;
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return "";
  const lo = Math.min(...nums), hi = Math.max(...nums);
  const span = hi - lo || 1;
  const x = (i: number) => pad + ((w - pad * 2) * i) / Math.max(1, values.length - 1);
  const y = (v: number) => h - pad - ((v - lo) / span) * (h - pad * 2);
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  const li = values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop() as number;
  const c = opts.color ?? SERIES_1;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" style="display:block;overflow:visible"><path d="${d}" fill="none" stroke="#C7CCFB" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${x(li)}" cy="${y(values[li] as number)}" r="3" fill="${c}"/></svg>`;
}

/** 범례 — 계열이 둘 이상일 때만. 색 칸 옆 글자는 잉크색 */
export function legend(series: { name: string; color: string }[]): string {
  if (series.length < 2) return "";
  return `<div class="lg">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>`;
}
