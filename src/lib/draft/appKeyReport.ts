import { FOLLOW_DAYS } from "@/lib/bigquery/couponFunnel";
import { CALM_FIXED_LABEL, CALM_WEEKS_MAX, CALM_WEEKS_MIN, DAU_GOAL, eventLabel, eventsIn, eventSpan, type AppEvent } from "./appEvents";
import { dashed, rangeLabel, type RangeUnit } from "./appRange";
import { barChart, legend, lineChart, sparkline, SERIES_1, SERIES_2, type ChartFrame, type ChartSeries } from "./appCharts";
import { bold, esc, fmtCell, fmtNum, page } from "./appRangePage";
import { SMALL_SAMPLE } from "./appReportData";
import { IDLE_STORES_TABLE, seriesRow, v260Ready, type AppSeries, type BaseWindow, type Cell, type SeriesKind, type SeriesRow } from "./appSeriesData";

/**
 * Probe · **앱 주요 지표 보고서** — 중요한 지표만, 글보다 그래프로(민찬 1015). 매주 · 매달 올라가는 정기 보고서다.
 *
 * 「지표 원본」과 같은 칸(AppSeries)을 읽는다 — 같은 기간이면 두 보고서의 숫자가 늘 같다.
 *
 * ── 1022 기획팀 검토(민찬 채택)로 바뀐 판정 ──
 * 9월판 KPI 의 빨강 ▼ 은 거짓 하락이었다. 「앞 7일」이 학생회 캠페인 꼬리라 평시와 견주면 전부 보합이었다.
 *  - 비교 기준은 **평시 기준선**이다. 사건(캠페인 · 휴일 · 릴리스) 없는 직전 주가 3주 이상이면 최근 4주 중앙값,
 *    아니면 9/1~14 두 주(D4). 앞 칸 대비는 색 없이 보조줄로만 남긴다(R4).
 *  - 사건이 걸린 칸은 모든 카드를 판정 유보한다(R2). 캠페인 표를 못 읽어도 미룬다 — 캠페인 칸을 평시로 착각하지 않게.
 *  - 비율 카드에도 우연 검정(두 비율 z ≥ 2)을 건다(R1). 9월판 「앱 열기 → 매장 상세 ▲ 8.8%p」는 z ≈ 1.9 였다.
 *  - 처음 온 기기 비중 규칙을 활성에서 가입 · 상세 · 다시 온 기기로 넓혔다(R2).
 *  - 유보한 카드는 %·화살표를 숨기고 「11 vs 10 · 사유」를 본문에 적는다(R3). 예전엔 사유가 툴팁에만 있었다.
 *  - 일 단위는 모니터링용이라 KPI 를 판정하지 않는다(R7). KPI 여섯 칸은 GA4 가 끝까지 들어온 같은 칸에 맞춘다(R13).
 */

export const PREV: Record<RangeUnit, string> = { day: "전날", week: "전주", month: "전월" };
/** 처음 온 기기 비중이 평시와 이만큼 다르면 같은 조건이 아니다 — appReportData returningBase 와 같은 값 */
const MIX_SHIFT = 0.25;
/** 비율이 이만큼(%p)도 안 바뀌면 색을 칠하지 않는다 — 판정 유보가 아니라 「거의 그대로」(민찬 1016) */
const RATE_FLAT = 1;
/**
 * 차이가 우연 범위 안이면 판정 유보(민찬 1016 「더 엄격하게」). 같은 빈도로 일어나는 일을 두 번 세면
 * 두 값의 차이는 대략 ±2√(두 값의 합) 안에서 흔들린다(포아송, 약 95%). 비율은 두 비율 z 검정으로 같은 문턱(1022 R1).
 */
const NOISE_Z = 2;
/** 처음 온 기기 비중 규칙을 거는 카드(1022 R2) */
const MIX_KEYS = new Set(["dau", "signups", "open_to_store", "returning"]);

const CSS = `
.kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:4px}
.kpi{background:#fff;border-radius:16px;border:1px solid rgba(0,0,0,.05);padding:14px 16px 12px;min-width:0}
.kpi .kl{font-size:12px;font-weight:700;color:var(--sub)}
.kpi .kv{font-size:28px;font-weight:800;letter-spacing:-.8px;line-height:1.15;margin-top:6px;color:var(--ink)}
.kpi .kv small{font-size:13px;font-weight:600;color:var(--mut);margin-left:3px;letter-spacing:0}
.kpi .kd{font-size:12px;font-weight:700;margin-top:3px;color:var(--sub)}
.kpi .kd.up{color:var(--good)} .kpi .kd.down{color:var(--bad)}
.kpi .kd span{font-weight:500;color:var(--mut);margin-left:4px}
.kpi .kd .hold{display:inline-block;margin:0 4px 0 0;padding:0 6px;border-radius:999px;background:var(--soft);color:var(--peri);font-weight:700;font-size:11px}
.kpi .kp{font-size:11px;color:var(--mut);margin-top:2px}
.kpi .sp{margin-top:8px}
.kpi .kh{font-size:11px;color:var(--mut);margin-top:6px}
.state{font-size:11.5px;color:var(--sub);margin-top:4px}
.evline{background:var(--soft2);border-radius:12px;padding:8px 12px;margin:2px 0 10px;font-size:12px;color:var(--tx)}
.evline b{color:var(--ink)}
.monitor{background:var(--soft2);border-radius:16px;padding:14px 16px;font-size:12.5px;color:var(--tx)}
.monitor b{color:var(--ink)}
.monitor ul{display:flex;flex-wrap:wrap;gap:6px 18px;list-style:none;margin-top:6px}
.knote{font-size:11.5px;color:var(--warn);background:var(--warnbg);border-radius:10px;padding:6px 10px;margin-top:8px}
.sec{margin-top:22px}
.sec>h2{font-size:16px;font-weight:800;letter-spacing:-.3px;padding:0 4px}
.sec>.desc{font-size:12px;color:var(--sub);padding:2px 4px 0}
.charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:8px}
.ch{background:#fff;border-radius:16px;border:1px solid rgba(0,0,0,.05);padding:14px 14px 10px;min-width:0}
.ch.wide{grid-column:1/-1}
.ch h3{font-size:13.5px;font-weight:800;letter-spacing:-.2px}
.ch .cs{font-size:11.5px;color:var(--sub);margin:1px 0 8px}
.ch .cn{font-size:11.5px;color:var(--warn);margin:-4px 0 6px}
.fold{grid-column:1/-1;background:var(--soft2);border-radius:16px;padding:10px 14px;margin:0;font-size:12px;color:var(--sub)}
.fold>summary{font-weight:700;color:var(--tx)}
.fold .charts{margin-top:10px}
.lg{display:flex;gap:12px;flex-wrap:wrap;font-size:11.5px;color:var(--tx);margin:-2px 0 6px}
.lg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
table.rounds{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums}
table.rounds th,table.rounds td{padding:4px 6px;border-bottom:1px solid var(--line2);text-align:right;white-space:nowrap}
table.rounds th:first-child,table.rounds td:first-child{text-align:left;white-space:normal}
table.rounds td.zero{color:var(--mut)}
details.tb{margin-top:6px;font-size:11.5px;color:var(--sub)}
details summary{cursor:pointer;list-style:none;font-weight:600}
details summary::-webkit-details-marker{display:none}
details summary::before{content:"▸ ";}
details[open] summary::before{content:"▾ ";}
details.tb table{margin-top:6px;border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
details.tb th,details.tb td{padding:3px 6px;border-bottom:1px solid var(--line2);text-align:right;white-space:nowrap}
details.tb th:first-child,details.tb td:first-child{text-align:left}
details.tb td.na{color:var(--mut)}
@media (max-width:720px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.charts{grid-template-columns:1fr}.ch.wide{grid-column:auto}}
@media print{@page{size:A4;margin:10mm}body{background:#fff}.wrap{padding:0}.sec,.ch,.kpi{break-inside:avoid}details.tb{display:none}}
`;

// ── KPI ────────────────────────────────────────────────────────────
/**
 * 위 여섯 칸 — 슬랙 주간·월간 게시의 본문 여섯 줄도 이것이다(민찬 1015).
 * 1022(민찬 D2 · D3 채택): 쿠폰 사용 · 스탬프 적립 두 칸을 「매장 이용 계정」 한 칸으로(건수는 그 칸 보조줄에),
 * 활성은 「하루 평균」으로 고정, 복귀는 「첫 실행 기기 1주 후 복귀」, 빈 칸에 「다시 온 기기」.
 * 주 3~5건짜리 쿠폰·스탬프는 따로 봐서는 주마다 판정할 수 없었다(±150%).
 */
export const KEY_KPIS: { key: string; label: string }[] = [
  { key: "dau", label: "하루 평균 활성 기기" },
  { key: "signups", label: "가입" },
  { key: "users_redeemed", label: "매장 이용 계정" },
  { key: "open_to_store", label: "앱 열기 → 매장 상세" },
  { key: "retention_w1", label: "첫 실행 기기 1주 후 복귀" },
  { key: "returning", label: "다시 온 기기" },
];

/**
 * 평시 기준선을 칸 길이에 맞추는 법.
 *  - avg: 하루 평균이라 그대로
 *  - perDay: 건수라 하루치 × 칸의 날 수
 *  - weekly: 칸 안 고유(기기·계정)라 7일 칸에만 견준다 — 한 달 고유는 주 값을 늘려서 만들 수 없다
 *  - rate: 기준 주들의 분자 합 ÷ 분모 합
 */
const SCALE: Record<string, "avg" | "perDay" | "weekly" | "rate"> = {
  dau: "avg", signups: "perDay", users_redeemed: "weekly", returning: "weekly", active: "weekly", open_to_store: "rate",
};

const md = (d: string) => `${+d.slice(4, 6)}/${+d.slice(6, 8)}`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (v: number) => Math.round(v * 10) / 10;

export const isGa4Row = (r: SeriesRow) => r.source === "ga4";

export interface Baseline {
  /** 칸 길이에 맞춘 기준값. 견줄 수 없으면 null */
  v: number | null;
  /** 비율 기준의 분자 · 분모 */
  x?: number;
  n?: number;
  /** 「평시(9/1~14)」 「평시 3주 중앙값」 */
  name: string;
  /** 기준으로 쓴 창 — 「9/28~10/4 · 10/26~11/1 · 11/2~8」 */
  windows: string;
  /** 기준 주들의 처음 온 기기 비중(0~1) */
  mix: number | null;
  /** v 가 null 인 까닭 */
  why?: string;
}

/** 이 칸(i)의 평시 기준선 — 칸보다 앞선 사건 없는 주가 3주 이상이면 최근 4주 중앙값, 아니면 9/1~14 */
export function baselineFor(s: AppSeries, key: string, i: number): Baseline | null {
  const b = s.buckets[i];
  const scale = SCALE[key];
  if (!b || !scale) return null;
  const calm = s.baseline.weeks.filter((w) => w.end < b.start).slice(-CALM_WEEKS_MAX);
  const useWeeks = calm.length >= CALM_WEEKS_MIN;
  const use: BaseWindow[] = useWeeks ? calm : s.baseline.fixed;
  if (!use.length) return null;
  const name = useWeeks ? `평시 ${use.length}주 중앙값` : CALM_FIXED_LABEL;
  const windows = use.map((w) => `${md(w.start)}~${md(w.end)}`).join(" · ");
  const sum = (k: string) => use.reduce((a, w) => a + (w.cells[k]?.v ?? 0), 0);
  const act = sum("active");
  const mix = act > 0 ? sum("new_devices") / act : null;
  if (scale === "rate") {
    const have = use.filter((w) => typeof w.cells[key]?.x === "number" && typeof w.cells[key]?.n === "number");
    const x = have.reduce((a, w) => a + (w.cells[key].x as number), 0), n = have.reduce((a, w) => a + (w.cells[key].n as number), 0);
    return n > 0 ? { v: round1((x / n) * 100), x, n, name, windows, mix } : { v: null, name, windows, mix, why: "평시 기준선을 못 셌습니다" };
  }
  const vals = use.map((w) => w.cells[key]?.v).filter((v): v is number => typeof v === "number");
  if (vals.length < use.length) return { v: null, name, windows, mix, why: "평시 기준선을 못 셌습니다" };
  const m = median(vals);
  if (scale === "avg") return { v: round1(m), name, windows, mix };
  if (scale === "perDay") return { v: round1((m / 7) * b.days), name, windows, mix };
  return b.days === 7
    ? { v: round1(m), name, windows, mix }
    : { v: null, name, windows, mix, why: `칸 안 고유 수라 주 기준과 견줄 수 없습니다(${name} 주 ${fmtNum(m, "avg")})` };
}

/** 두 비율 z — 같은 비율에서 나온 두 표본이면 |z| < 2 가 95% */
function zTwo(x1: number, n1: number, x2: number, n2: number): number {
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (x1 / n1 - x2 / n2) / se : 0;
}

function change(kind: SeriesKind, a: number, b: number): { text: string; tone: "up" | "down" | "" } {
  if (kind === "rate") {
    const p = round1(a - b);
    return { text: p === 0 ? "변화 없음" : `${p > 0 ? "▲" : "▼"} ${Math.abs(p)}%p`, tone: p > 0 ? "up" : p < 0 ? "down" : "" };
  }
  if (b === 0) return { text: a === 0 ? "변화 없음" : "▲ 새로 생김", tone: a === 0 ? "" : "up" };
  const pct = round1(((a - b) / b) * 100);
  return { text: pct === 0 ? "변화 없음" : `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`, tone: pct > 0 ? "up" : pct < 0 ? "down" : "" };
}

export interface KpiFacts {
  key: string;
  label: string;
  row: SeriesRow;
  /** 보여 줄 칸 — 끝난 칸이 없으면 null */
  i: number | null;
  kind: SeriesKind;
  cell: Cell;
  /** 평시 대비 — 판정했으면 { text, tone }. 유보·기준 없음이면 null */
  delta: { text: string; tone: "up" | "down" | "" } | null;
  /** 견준 기준 — 「평시(9/1~14)」. 코호트 지표처럼 기준을 안 쓰면 "" */
  baseName: string;
  /** 칸 길이에 맞춘 기준값 — 유보여도 「11 vs 10」으로 적는다 */
  base: number | null;
  /** 앞 칸 대비 — 색 없이 보조줄(R4) */
  prev: { name: string; text: string } | null;
  /** 색을 빼고 판정을 미룬 까닭 — 없으면 "" */
  hold: string;
  /** 칸 아래 한 줄 — 고유 기기 · 쿠폰/스탬프 건수 · 분모 · 코호트 */
  sub: string;
  /** 이 칸의 사건 */
  events: AppEvent[];
}

const vOf = (s: AppSeries, key: string, i: number) => seriesRow(s, key)?.cells[i]?.v ?? null;

/** KPI 칸 아래 보조줄 — 큰 숫자만으로 안 보이는 것 */
function subLine(s: AppSeries, key: string, i: number, cell: Cell): string {
  const u = s.spec.unit;
  const n = (v: number | null, unit: string) => (v === null ? "–" : `${fmtNum(v, "count")}${unit}`);
  if (key === "dau") return `${u === "month" ? "그 달" : "그 주"} 고유 ${n(vOf(s, "active", i), "대")} · 목표 ${DAU_GOAL}대`;
  if (key === "users_redeemed") return `쿠폰 ${n(vOf(s, "coupon_used", i), "건")} · 스탬프 ${n(vOf(s, "stamp_earned", i), "건")}`;
  if (key === "open_to_store") return cell.n !== undefined ? `분모 세션 ${fmtNum(cell.n, "count")}` : "";
  if (key === "retention_w1") return cell.span ? `코호트 ${cell.span}` : "";
  if (key === "returning") return `처음 온 기기 ${n(vOf(s, "new_devices", i), "대")}`;
  if (key === "signups") return "직원 제외 · 탈퇴 빠짐";
  return "";
}

/**
 * KPI 한 칸의 사실. `focus` 를 주면 그 칸(슬랙 게시 — 그 주 · 그 달), 안 주면 **GA4 가 끝까지 들어온 마지막 칸**.
 * 여섯 칸을 같은 칸에 맞춘다 — 예전엔 DB 칸이 GA4 보다 한 주 앞서 한 줄에 두 주가 섞였다(R13).
 *
 * 판정 유보(색 없음) — 위에서부터 먼저 걸리는 하나:
 *  1. 캠페인 표를 못 읽음 · 사건이 걸린 칸
 *  2. 평시 기준선이 없거나 견줄 수 없음(월 칸의 고유 수)
 *  3. 표본이 얕음(비율 분모 30 미만 · 지켜보는 중)
 *  4. 건수: 두 값의 합 30 미만(참고) · 차이가 ±2√합 안 / 비율: 분모 30 미만 · |z| < 2
 *  5. 처음 온 기기 비중이 평시와 25%p 넘게 다름(활성 · 가입 · 상세 · 다시 온 기기, 둘 다 활성 30 이상일 때)
 * 복귀(코호트)는 평시 기준선이 없어 판정하지 않고 코호트 날짜·n 만 적는다.
 */
export function kpiFacts(s: AppSeries, key: string, label: string, focus?: number): KpiFacts | null {
  const r = seriesRow(s, key);
  if (!r) return null;
  const unit = s.spec.unit;
  let i: number | null = focus ?? null;
  if (i === null) for (let k = s.buckets.length - 1; k >= 0 && i === null; k--) if (!s.buckets[k].open) i = k;
  const empty = { key, label, row: r, kind: r.kind, delta: null, baseName: "", base: null, prev: null, events: [] as AppEvent[] };
  if (i === null) return { ...empty, i: null, cell: { v: null, why: "끝난 칸 없음" }, hold: "", sub: "" };

  const b = s.buckets[i];
  const cell = r.cells[i];
  const events = eventsIn(s.events, b.start, b.end);
  const prevCell = i > 0 ? r.cells[i - 1] : undefined;
  const prev = prevCell && prevCell.v !== null && cell.v !== null ? { name: PREV[unit], text: change(r.kind, cell.v, prevCell.v).text } : null;
  const sub = subLine(s, key, i, cell);
  const facts = { ...empty, i, cell, prev, sub, events };
  if (cell.v === null) return { ...facts, hold: "" };
  if (key === "retention_w1") return { ...facts, hold: "" };

  const base = baselineFor(s, key, i);
  const out = (hold: string, delta: KpiFacts["delta"] = null): KpiFacts => ({ ...facts, baseName: base?.name ?? "", base: base?.v ?? null, hold, delta });

  if (!s.eventsOk) return out("캠페인 주간 표를 못 읽어 사건 칸을 가를 수 없습니다");
  if (events.length) return out(`사건 칸 — ${eventLabel(events)}`);
  if (!base) return out("평시 기준선이 없습니다");
  if (base.v === null) return out(base.why ?? "평시 기준선을 못 셌습니다");
  if (cell.weak) return out(cell.why ? `표본이 얕습니다(${cell.why})` : "표본이 얕습니다");

  if (r.kind === "rate") {
    if (cell.n === undefined || cell.x === undefined || base.n === undefined || base.x === undefined) return out("분모를 몰라 판정할 수 없습니다");
    if (cell.n < SMALL_SAMPLE) return out(`분모 ${cell.n} — 참고`);
    const z = zTwo(cell.x, cell.n, base.x, base.n);
    if (Math.abs(z) < NOISE_Z) return out(`차이가 우연 범위 안입니다(z ${round1(z)})`);
  } else {
    // 하루 평균은 기기·일 합으로 잰다 — 7일 평균 14 와 13 은 98 과 91 의 차이다
    const days = r.kind === "avg" ? b.days : 1;
    const a = cell.v * days, bb = base.v * days, sum = a + bb;
    if (sum < SMALL_SAMPLE) return out(`건수가 적어 참고만 — 두 값 합 ${fmtNum(sum, "count")}`);
    const noise = NOISE_Z * Math.sqrt(sum);
    if (Math.abs(a - bb) < noise) return out(`차이가 우연 범위(±${fmtNum(round1(noise / days), r.kind)}) 안입니다`);
  }

  if (MIX_KEYS.has(key) && base.mix !== null) {
    const act = vOf(s, "active", i), nw = vOf(s, "new_devices", i);
    if (act !== null && nw !== null && act >= SMALL_SAMPLE && act > 0 && Math.abs(nw / act - base.mix) >= MIX_SHIFT) {
      return out(`처음 온 기기 비중이 평시와 다릅니다(${Math.round(base.mix * 100)}% → ${Math.round((nw / act) * 100)}%)`);
    }
  }

  const d = change(r.kind, cell.v, base.v);
  return out("", r.kind === "rate" && Math.abs(cell.v - base.v) < RATE_FLAT ? { ...d, tone: "" } : d);
}

function kpi(s: AppSeries, f: KpiFacts | null): string {
  if (!f) return "";
  const r = f.row;
  const unit = r.unit;
  const when = f.i === null ? "" : `${s.buckets[f.i].label}${s.buckets[f.i].open ? " · 진행 중" : ""}`;
  const value = f.cell.v === null ? "–" : `${fmtCell(f.cell, f.kind)}<small>${esc(unit)}</small>`;
  const fmt = (v: number) => `${fmtNum(v, f.kind)}${unit}`;
  let line: string;
  if (f.cell.v === null) line = `<p class="kd"><span>${esc(f.cell.why ?? "값 없음")}</span></p>`;
  else if (f.delta) line = `<p class="kd${f.delta.tone ? ` ${f.delta.tone}` : ""}">${esc(f.delta.text)}<span>${esc(f.baseName)} 대비 · ${esc(fmt(f.base as number))}</span></p>`;
  else if (f.hold) line = `<p class="kd"><span class="hold">판정 유보</span>${f.base !== null ? `${esc(fmt(f.cell.v))} vs ${esc(fmt(f.base))}` : ""}<span>${esc(f.hold)}</span></p>`;
  else line = `<p class="kd"><span>평시 기준 없이 봅니다 — 코호트 지표</span></p>`;
  const prev = f.prev ? `<p class="kp">${esc(f.prev.name)} 대비 ${esc(f.prev.text)} · 참고</p>` : "";
  const tip = f.key === "users_redeemed" && f.i !== null
    ? `쿠폰 쓴 계정 ${vOf(s, "coupon_users", f.i) ?? "–"}명 · 스탬프 받은 계정 ${vOf(s, "stamp_users", f.i) ?? "–"}명 — ${r.note}`
    : r.note;
  return `<div class="kpi" title="${esc(tip)}">
  <p class="kl">${esc(f.label)}</p>
  <p class="kv">${value}</p>
  ${line}${prev}
  <div class="sp">${sparkline(r.cells.map((c, i) => (s.buckets[i].open ? null : c.v)))}</div>
  <p class="kh">${esc([when, f.sub].filter(Boolean).join(" · "))}</p>
</div>`;
}

// ── 그래프 카드 ──────────────────────────────────────────────────────
const bucketEvents = (s: AppSeries) => s.buckets.map((b) => eventsIn(s.events, b.start, b.end));
const tip = (s: AppSeries, i: number, text: string) => {
  const ev = eventsIn(s.events, s.buckets[i].start, s.buckets[i].end);
  return `${s.buckets[i].label}${s.buckets[i].open ? " (진행 중)" : ""} · ${text}${ev.length ? ` · 사건: ${eventLabel(ev)}` : ""}`;
};
const cellText = (r: SeriesRow, c: Cell) =>
  c.v === null
    ? `– ${c.why ?? ""}`.trim()
    : `${fmtCell(c, r.kind)}${r.unit}${c.n !== undefined && r.kind === "rate" ? ` (${c.x !== undefined ? `${c.x.toLocaleString("ko-KR")}/` : "분모 "}${c.n.toLocaleString("ko-KR")})` : ""}${c.span ? ` · ${c.span}` : ""}${c.weak && c.why ? ` · ${c.why}` : ""}`;

/** 그래프 아래 「표로 보기」 — 색을 못 가리는 사람·숫자를 옮겨 적을 때 */
function table(s: AppSeries, rows: { name: string; row: SeriesRow }[]): string {
  const head = `<tr><th>칸</th>${rows.map((r) => `<th>${esc(r.name)}</th>`).join("")}</tr>`;
  const body = s.buckets.map((b, i) => `<tr><td>${esc(b.label)}${b.open ? "＊" : ""}</td>${rows.map((r) => {
    const c = r.row.cells[i];
    return `<td${c.v === null ? ' class="na"' : ""}${c.why ? ` title="${esc(c.why)}"` : ""}>${fmtCell(c, r.row.kind)}</td>`;
  }).join("")}</tr>`).join("");
  const tot = `<tr><td><b>기간 전체</b></td>${rows.map((r) => `<td><b>${fmtCell(r.row.total, r.row.kind)}</b></td>`).join("")}</tr>`;
  return `<details class="tb"><summary>표로 보기</summary><table>${head}${body}${tot}</table></details>`;
}

const frameOf = (s: AppSeries, r: SeriesRow, title: string, wide: boolean, tips?: string[], ref?: ChartFrame["ref"]): ChartFrame => ({
  labels: s.buckets.map((b) => b.label),
  open: s.buckets.map((b) => b.open),
  kind: r.kind,
  unit: r.unit,
  title,
  width: wide ? 900 : 440,
  height: wide ? 210 : 180,
  tips: tips ?? r.cells.map((c, i) => tip(s, i, cellText(r, c))),
  marks: bucketEvents(s).map((e) => e.length > 0),
  ...(ref ? { ref } : {}),
});

/** 칸이 모두 같은 이유로 비었으면 그 이유를 부제에 */
function emptyWhy(r: SeriesRow): string {
  if (r.cells.some((c) => c.v !== null)) return "";
  const why = r.cells[0]?.why;
  return why && r.cells.every((c) => c.why === why) ? ` — ${why}${r.total.v !== null ? ` · 기간 전체 ${fmtCell(r.total, r.kind)}${r.unit}` : ""}` : "";
}

function card(title: string, sub: string, body: string, wide: boolean, note = ""): string {
  return `<div class="ch${wide ? " wide" : ""}"><h3>${esc(title)}</h3><p class="cs">${esc(sub)}</p>${note ? `<p class="cn">${esc(note)}</p>` : ""}${body}</div>`;
}

function single(s: AppSeries, key: string, title: string, sub: string, form: "bar" | "line", wide = false, ref?: ChartFrame["ref"], note = ""): string {
  const r = seriesRow(s, key);
  if (!r) return "";
  // 비율의 선은 끝나지 않은 칸을 긋지 않는다 — 사흘치 DAU/WAU 는 늘 높게 나와 마지막에 치솟는 선이 된다.
  // 건수 막대는 옅게 그대로 둔다(덜 찬 막대는 덜 찼다고 읽힌다). 값은 「표로 보기」와 원본에 있다.
  const hide = (i: number) => form === "line" && s.buckets[i].open;
  const series: ChartSeries = { name: title, color: SERIES_1, values: r.cells.map((c, i) => (hide(i) ? null : c.v)), weak: r.cells.map((c) => !!c.weak) };
  const f = frameOf(s, r, title, wide, r.cells.map((c, i) => tip(s, i, hide(i) ? "진행 중 — 칸이 끝나면 긋습니다" : cellText(r, c))), ref);
  const chart = form === "bar" ? barChart([series], f) : lineChart(series, f);
  return card(title, `${sub}${emptyWhy(r)}`, chart + table(s, [{ name: title, row: r }]), wide, note);
}

/** 쌓은 막대 — 두 행을 아래부터 */
function stacked(s: AppSeries, keys: [string, string], names: [string, string], title: string, sub: string, ref?: ChartFrame["ref"], note = ""): string {
  const a = seriesRow(s, keys[0]), b = seriesRow(s, keys[1]);
  if (!a || !b) return "";
  const series: ChartSeries[] = [
    { name: names[0], color: SERIES_1, values: a.cells.map((c) => c.v) },
    { name: names[1], color: SERIES_2, values: b.cells.map((c) => c.v) },
  ];
  const tips = a.cells.map((c, i) => tip(s, i, `${names[0]} ${c.v ?? `– ${c.why ?? ""}`} + ${names[1]} ${b.cells[i].v ?? `– ${b.cells[i].why ?? ""}`}`));
  const f = frameOf(s, a, title, true, tips, ref);
  return card(title, sub, legend(series) + barChart(series, f) + table(s, [{ name: names[0], row: a }, { name: names[1], row: b }]), true, note);
}

/** 평시 기준선 점선 — 칸마다 그 칸의 기준(월 칸은 날 수가 달라 높이가 다르다) */
function refFor(s: AppSeries, key: string): ChartFrame["ref"] | undefined {
  if (s.spec.unit === "day") {
    // 일 칸은 하루치 — 하루 평균 활성 · 하루치 가입
    const scale = key === "active" ? "dau" : key;
    const wk = s.buckets.map((_, i) => baselineFor({ ...s, buckets: s.buckets.map((b) => ({ ...b, days: 7 })) }, scale, i)?.v ?? null);
    const values = wk.map((v) => (v === null ? null : key === "signups" ? round1(v / 7) : v));
    return values.some((v) => v !== null) ? { values, label: "평시" } : undefined;
  }
  const values = s.buckets.map((_, i) => baselineFor(s, key, i)?.v ?? null);
  return values.some((v) => v !== null) ? { values, label: "평시" } : undefined;
}

/**
 * 「10월 MAU 기계적 감소」(A10) — 앞 달에 설치가 몰렸으면 그 기기 중 다시 안 켠 몫이 이 달 활성에서 빠진다.
 * 9/15~17 학생회 캠페인 설치가 10/15~17 에 30일 창을 지난다. 앞 달 처음 온 기기가 활성의 절반을 넘을 때만 적는다.
 */
function installDrain(s: AppSeries, i: number): string {
  if (s.spec.unit !== "month" || i <= 0) return "";
  const nw = vOf(s, "new_devices", i - 1), act = vOf(s, "active", i - 1);
  if (nw === null || act === null || act < SMALL_SAMPLE || nw / act < 0.5) return "";
  return `앞 달(${s.buckets[i - 1].label}) 활성 ${fmtNum(act, "count")}대 중 ${fmtNum(nw, "count")}대(${Math.round((nw / act) * 100)}%)가 처음 온 기기였습니다 — 다시 안 켠 기기가 빠져 이 달 활성이 저절로 줄어 보입니다.`;
}

/** 활성 기기 = 다시 온 기기 + 처음 온 기기 — 쌓은 막대. 설치가 몰린 칸과 돌아온 사람이 는 칸을 한눈에 가른다 */
function activeChart(s: AppSeries, focus: number | null): string {
  const act = seriesRow(s, "active"), ret = seriesRow(s, "returning"), nw = seriesRow(s, "new_devices");
  if (!act || !ret || !nw) return "";
  const series: ChartSeries[] = [
    { name: "다시 온 기기", color: SERIES_1, values: ret.cells.map((c) => c.v) },
    { name: "처음 온 기기", color: SERIES_2, values: nw.cells.map((c) => c.v) },
  ];
  const tips = act.cells.map((c, i) => tip(s, i, c.v === null ? `– ${c.why ?? ""}` : `활성 ${fmtNum(c.v, "count")}대 = 다시 온 ${ret.cells[i].v ?? "–"} + 처음 온 ${nw.cells[i].v ?? "–"}`));
  const u = s.spec.unit;
  const ref = u === "month" ? undefined : refFor(s, "active");
  // 목표(하루 평균)는 일 칸에만 긋는다 — 주·월 막대는 칸 전체의 고유 기기라 하루 목표와 견줄 수 없다
  const f: ChartFrame = { ...frameOf(s, act, "활성 기기", true, tips, ref), ...(u === "day" ? { goal: { value: DAU_GOAL, label: `목표 ${DAU_GOAL}` } } : {}) };
  const sub = `대 · ${u === "day" ? "그날" : u === "week" ? "그 주" : "그 달"} 앱을 켠 고유 기기 — 아래는 전에도 온 기기, 위는 그 칸에 처음 연 기기${u === "month" ? " · 월 고유 수는 주 기준선과 견줄 수 없어 평시 점선을 긋지 않습니다" : " · 점선은 평시 기준선"}${u === "day" ? ` · 실선은 목표(하루 ${DAU_GOAL}대)` : ""}`;
  return card("활성 기기", sub, legend(series) + barChart(series, f) + table(s, [{ name: "활성", row: act }, { name: "다시 온", row: ret }, { name: "처음 온", row: nw }]), true, focus === null ? "" : installDrain(s, focus));
}

/**
 * 제휴 매장 활동(D8 · 1023) — 지금 앱 제휴 매장 중 쿠폰 사용이나 스탬프가 있었던 곳의 비율.
 * Probe 는 앱 내부 지표로만 말한다(민찬 1023) — 분모는 Astro 계약이 아니라 앱의 제휴 표시다.
 * 아래에 KPI 칸(focus)의 활동 0건 매장을 적는다.
 */
function affiliateCard(s: AppSeries, focus: number | null): string {
  const r = seriesRow(s, "affiliate_active_rate");
  if (!r || r.cells.every((c) => c.v === null)) return "";
  const i = focus ?? s.buckets.length - 1;
  const b = s.buckets[i];
  const idle = s.long.filter((l) => l.table === IDLE_STORES_TABLE && l.start === b.start).map((l) => l.dim);
  const note = idle.length ? `${b.label} 활동 0건 제휴 매장 ${idle.length}곳: ${idle.join(", ")}` : `${b.label} 활동 0건 제휴 매장 없음`;
  return single(s, "affiliate_active_rate", "활동 제휴 매장 비율", "% · 지금 앱 제휴 매장 중 쿠폰 사용이나 스탬프가 1건 이상인 곳(DB) — 분모가 지금 목록이라 지난 칸일수록 낮게 나올 수 있음 · 점에 마우스를 올리면 활동/제휴 곳 수", "line", true, undefined, note);
}

/** 마일리지 회차표(C9 · A12 · A13) — 날짜 막대는 응모가 마감일 앞에 몰려 잡음이라 회차 한 줄씩 */
function roundsCard(s: AppSeries, focus: number | null): string {
  const u = s.spec.unit;
  const b = focus === null ? null : s.buckets[focus];
  const earned = focus === null ? null : vOf(s, "mileage_points_earned", focus);
  const spent = focus === null ? null : vOf(s, "mileage_points_spent", focus);
  const flow = b ? `${b.label} 마일리지 적립 ${earned === null ? "–" : `${fmtNum(earned, "count")}P`} · 응모 사용 ${spent === null ? "–" : `${fmtNum(spent, "count")}P`}` : "";
  if (s.rounds === null) {
    return card("마일리지 회차", `${flow}${flow ? " · " : ""}회차 요약을 읽지 못했습니다`, `<p class="cs">백엔드 app-stats/raffles 가 반영되기 전이면 비어 있습니다. 응모 · 당첨 건수는 「지표 원본」 이전 판에 있습니다.</p>`, true);
  }
  // 주간판은 그 주 회차만, 월간판은 그 달 회차(마감일 기준)
  const inFocus = s.rounds.filter((r) => !b || (r.closes_at.slice(0, 10).replace(/-/g, "") >= b.start && r.closes_at.slice(0, 10).replace(/-/g, "") <= b.end));
  const td = (v: number) => `<td${v === 0 ? ' class="zero"' : ""}>${fmtNum(v, "count")}</td>`;
  const rows = inFocus.map((r) => `<tr><td>${esc(`${md(r.closes_at.slice(0, 10).replace(/-/g, ""))} 마감 · ${r.title}`)}</td><td>${esc(r.prize_label || "–")}</td>${td(r.entries)}${td(r.entrants)}${td(r.points)}${td(r.winners)}${td(r.voucher_redeemed)}</tr>`).join("");
  const body = inFocus.length
    ? `<table class="rounds"><tr><th>회차</th><th>상품</th><th>응모</th><th>응모자</th><th>응모 P</th><th>당첨</th><th>식사권 사용</th></tr>${rows}</table>`
    : `<p class="cs">${b ? `${esc(b.label)}에 마감한 회차가 없습니다.` : "회차가 없습니다."}</p>`;
  const scope = !b ? "이 기간" : u === "month" ? "그 달" : "그 주";
  return card("마일리지 회차", `${flow ? `${flow} · ` : ""}${scope}에 마감한 회차 — 응모 0 인 회차도 줄로 보입니다. 당첨률은 앞 회차 응모분이 섞여 계산하지 않습니다`, body, true);
}

/**
 * 앱 2.6.0 지표 묶음(R11 · D6) — 값이 있는 칸이 3개 미만이거나 마지막 끝난 칸이 기준(게시 2주 · 보급 50%)을 못 넘었으면 접는다.
 * 손으로 지우면 되살릴 사람이 없다 — 양식은 매달 다시 쓴다(X3).
 */
function v260Fold(s: AppSeries, focus: number | null, cards: string[]): string {
  const keys = ["coupon_claimed", "claim_to_use"];
  const valued = Math.min(...keys.map((k) => seriesRow(s, k)?.cells.filter((c) => c.v !== null).length ?? 0));
  const share = focus === null ? null : vOf(s, "app_v260", focus);
  const ready = focus !== null && v260Ready(s.buckets[focus].end, share);
  const body = cards.filter(Boolean).join("");
  if (valued >= 3 && ready) return body;
  const state = valued === 0 ? "계측 전" : "보급 중";
  return `<details class="fold"><summary>쿠폰 받기 · 받기 누른 쿠폰 → ${FOLLOW_DAYS}일 사용 — ${state} · 앱 2.6.0~ · 보급률 ${share === null ? "–" : `${fmtNum(share, "rate")}%`} (게시 2주 · 보급 50% 를 넘으면 펼칩니다)</summary><div class="charts">${body}</div></details>`;
}

function section(title: string, desc: string, cards: string[]): string {
  const body = cards.filter(Boolean);
  return body.length ? `<section class="sec"><h2>${esc(title)}</h2><p class="desc">${esc(desc)}</p><div class="charts">${body.join("")}</div></section>` : "";
}

export interface KeyReportOpts {
  /** 머리 칩 — 기본 「Probe · 앱 주요 지표」 */
  chip?: string;
  /** 제목 — 기본 「앱 주요 지표 보고서」. 슬랙 게시는 「앱 지표 주간 보고서 · 10월 2주차」 */
  title?: string;
  /** KPI 를 이 칸에 묶는다 — 슬랙 게시는 그 주·그 달 */
  focus?: number;
}

/** 머리의 데이터 상태 한 줄(A9 · R12) — 언제 · 어디까지 · 어느 코드로 센 숫자인가 */
export function dataState(s: AppSeries): string {
  return [
    `생성 ${s.generatedAt} KST`,
    s.through ? `GA4 확정 ${dashed(s.through)}까지` : "GA4 미연결",
    `DB 기준 ${s.dbAt ?? "못 읽음"}`,
    `리비전 ${s.revision}`,
  ].join(" · ");
}

/** 일 단위판(R7) — 캠페인·릴리스 모니터링용. KPI 대신 기간 합계만 */
function monitorBand(s: AppSeries): string {
  const t = (key: string, unit: string, kind: SeriesKind = "count") => {
    const r = seriesRow(s, key);
    return r && r.total.v !== null ? `${fmtNum(r.total.v, kind)}${unit}` : "–";
  };
  const act = seriesRow(s, "active");
  const days = act?.cells.filter((c, i) => c.v !== null && !s.buckets[i].open) ?? [];
  const avg = days.length ? `${fmtNum(round1(days.reduce((a, c) => a + (c.v as number), 0) / days.length), "avg")}대` : "–";
  return `<div class="monitor"><b>일 단위는 캠페인 · 릴리스 모니터링용입니다 — 판정하지 않습니다.</b> 하루치는 요일에 크게 흔들려 늘었다 · 줄었다로 읽지 않습니다. 판정은 주 단위(주간판)와 월 단위(월간판)에서 합니다.
<ul><li>하루 평균 활성 <b>${avg}</b></li><li>가입 <b>${t("signups", "명")}</b></li><li>매장 이용 계정 <b>${t("users_redeemed", "명")}</b></li><li>쿠폰 사용 <b>${t("coupon_used", "건")}</b></li><li>스탬프 적립 <b>${t("stamp_earned", "건")}</b></li></ul></div>`;
}

export function renderKeyReport(s: AppSeries, bar: string, opts: KeyReportOpts = {}): string {
  const u = s.spec.unit;
  const facts = u === "day" ? [] : KEY_KPIS.map((k) => kpiFacts(s, k.key, k.label, opts.focus));
  const focus = facts.find((f) => f?.i !== null && f?.i !== undefined)?.i ?? null;
  const fb = focus === null ? null : s.buckets[focus];
  const evFocus = fb ? eventsIn(s.events, fb.start, fb.end) : [];
  const evAll = eventsIn(s.events, s.spec.start, s.spec.end);
  const shown = facts.filter(Boolean).length;
  const baseNames = [...new Set(facts.map((f) => f?.baseName).filter(Boolean))].join(" · ");

  const kpiNote = u === "day"
    ? ""
    : `**위 ${shown}칸은 ${fb ? `${fb.label}(${md(fb.start)}~${md(fb.end)})` : "마지막으로 끝난 칸"}의 값**이고, 색과 %는 **평시 기준선**(${baseNames || "없음"}) 대비입니다. ${PREV[u]} 대비는 참고로 색 없이 둡니다. 여섯 칸 모두 GA4 가 끝까지 들어온 같은 칸에 맞췄습니다.`;
  const evLine = u === "day"
    ? (evAll.length ? `<p class="evline"><b>이 기간의 사건</b> ${esc(evAll.map(eventSpan).join(" · "))}</p>` : "")
    : `<p class="evline"><b>이번 칸의 사건</b> ${fb ? esc(evFocus.length ? evFocus.map(eventSpan).join(" · ") : "없음(평시)") : "–"}${s.eventsOk ? "" : " · <b>캠페인 표를 못 읽었습니다</b>"}</p>`;
  const drain = focus === null ? "" : installDrain(s, focus);

  const stickTitle = seriesRow(s, "stickiness")?.label ?? "DAU/WAU";

  const body = `
<header class="head">
  <span class="chip">${esc(opts.chip ?? "Probe · 앱 주요 지표")}</span>
  <h1>${esc(opts.title ?? "앱 주요 지표 보고서")}</h1>
  <p class="sub">${esc(rangeLabel(s.spec))}</p>
  <p class="state">${esc(dataState(s))}${s.exclusions.length ? ` · 뺀 값: ${esc(s.exclusions.join(" · "))}` : ""}</p>
</header>
${s.warnings.length ? `<div class="warn"><b>읽지 못한 값이 있습니다</b><ul>${s.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
${evLine}
${u === "day" ? monitorBand(s) : `<div class="kpis">
  ${facts.map((f) => kpi(s, f)).join("\n  ")}
</div>${drain ? `<p class="knote">${esc(drain)}</p>` : ""}`}
${section("이용", "학생이 앱을 켜는가, 새로 오는가 돌아오는가", [
  activeChart(s, focus),
  single(s, "signups", "가입", "명 · 새로 만든 계정(DB) — 직원 제외 · 탈퇴 빠짐 · 점선은 평시 기준선", "bar", true, refFor(s, "signups")),
])}
${section("매장 이용", "받은 쿠폰이 매장에서 쓰이는가", [
  single(s, "coupon_used", "쿠폰 사용", "건 · 매장에서 사용 처리된 날 기준(DB)", "bar"),
  u === "month"
    ? single(s, "coupon_issued", "쿠폰 발급 (월말 스냅샷)", "장 · 월말에 굳힌 그 달 발급(DB), 취소 제외 — 스냅샷 없는 달은 다시 센 값이라 줄 수 있음", "bar")
    : stacked(s, ["use_organic_issued", "use_campaign_issued"], ["캠페인 외", "캠페인"], "처음 받은 쿠폰", "장 · 그 칸에 처음 받은 쿠폰(GA4) — DB 발급은 만료 삭제로 다시 셀 때마다 줄어 일·주판은 GA4 로 셉니다"),
  single(s, "use_organic_rate", `쿠폰 ${FOLLOW_DAYS}일 사용률 (캠페인 외)`, `% · 가입 환영·스탬프 보상·추천·한정 등 그 칸에 처음 받은 쿠폰 중 받은 뒤 ${FOLLOW_DAYS}일 안에 쓰인 비율 · 점에 마우스를 올리면 사용/받은 장 수(GA4) · 분모 30 미만은 속 빈 점(참고)`, "line", true),
  u === "month" ? single(s, "active_restaurants", "활동 매장", "곳 · 쿠폰 사용이나 스탬프가 1건 이상인 매장(DB) — 제휴를 끈 매장도 셉니다. 제휴 매장 대비는 옆 그래프", "bar", true) : "",
  u === "day" ? "" : affiliateCard(s, focus),
  v260Fold(s, focus, [
    single(s, "coupon_claimed", "쿠폰 받기", "장 · 학생이 「받기」를 눌러 받은 쿠폰, 자동 지급 제외 · 앱 2.6.0~(GA4)", "bar"),
    single(s, "claim_to_use", `받기 누른 쿠폰 → ${FOLLOW_DAYS}일 사용`, `% · 「받기」로 받은 쿠폰 중 받은 뒤 ${FOLLOW_DAYS}일 안에 쓰인 비율(GA4)`, "line"),
  ]),
])}
${section("스탬프 · 마일리지", "재방문 장치가 도는가", [
  (seriesRow(s, "qr_visits")?.cells.some((c) => c.v !== null) ?? false)
    ? stacked(s, ["stamp_earned", "qr_visits"], ["스탬프 적립", "QR 방문 적립"], "매장 방문 적립", "건 · 스탬프 적립(한 번에 여러 개도 1건) + QR 방문 적립(10/18 매장 QR 안내~)(DB)")
    : single(s, "stamp_earned", "스탬프 적립", "건 · 찍은 횟수, 한 번에 여러 개도 1건(DB)", "bar", true),
  roundsCard(s, focus),
])}
${section("전환 · 재방문", "앱을 켠 사람이 매장으로 가고, 다시 오는가", [
  single(s, "open_to_store", "앱 열기 → 매장 상세", "% · 앱 열기 세션 중 매장 상세를 연 비율(GA4)", "line", u !== "week"),
  u === "week" ? single(s, "stickiness", stickTitle, "% · 하루 평균 활성 ÷ 그 주 고유 기기(GA4)", "line") : "",
  u === "month" ? single(s, "retention_w1", "첫 실행 기기 1주 후 복귀", "% · 그 달 첫 실행 기기 중 7~13일째 다시 켠 비율(GA4) — 점마다 코호트 날짜·기기 수", "line", true) : "",
])}
<section class="card"><h2>읽는 법</h2><ul class="notes">${[
    kpiNote,
    u === "day" ? "" : `**평시 기준선** — 사건(캠페인 · 휴일 · 릴리스) 없는 직전 주가 ${CALM_WEEKS_MIN}주 이상 쌓이면 최근 ${CALM_WEEKS_MAX}주 중앙값, 그 전까지는 9/1~14 두 주입니다. 건수는 하루치 × 칸의 날 수, 하루 평균은 그대로, 비율은 그 주들의 분자 합 ÷ 분모 합으로 맞춥니다. 칸 안 고유 수(매장 이용 계정 · 다시 온 기기)는 주 칸에서만 견줍니다.`,
    u === "day" ? "" : "**판정 유보(색 없음)** — 사건이 걸린 칸, 분모나 두 값의 합이 30 미만(참고), 차이가 우연 범위 안(건수 ±2√두 값의 합 · 비율 두 비율 z 2 미만), 처음 온 기기 비중이 평시와 25%p 넘게 다른 칸입니다. 유보한 칸은 %와 화살표 없이 「이번 값 vs 평시」와 사유를 적습니다. 비율이 1%p 미만으로 바뀐 칸도 색 없이 둡니다.",
    "**옅은 금색 띠는 사건이 걸린 칸**, **막대 바닥의 얇은 회색 선은 0**, **칸 높이 전체의 옅은 회색 띠는 못 센 칸**입니다. 선이 끊긴 곳도 0 이 아니라 값이 없는 칸입니다. 그래프에 마우스를 올리면 값 · 이유 · 사건이, 「표로 보기」에 숫자가 있습니다.",
    `${s.buckets.some((b) => b.open) ? "**옅은 막대**는 아직 끝나지 않은 칸(＊), " : ""}**속 빈 점**은 표본 30 미만 · 지켜보는 중 · 앱 2.6.0 보급 전인 칸입니다.`,
    "**기기는 「대」, 계정은 「명」입니다.** GA4 지표는 기기 단위라 재설치하면 새 기기로 셉니다. 가입 · 매장 이용 계정은 DB 계정입니다.",
    "**KPI 묶음값 · 판정 사유는 이 보고서에만 있습니다.** 칸 값과 정의는 같은 기간의 「지표 원본」에 있고, 이 보고서에 없는 묶음(찾기 퍼널 세부 · 쓰기 퍼널 · 가입 퍼널 · 푸시 · 배너 · 매장 목록 카드 → 클릭 · DAU/MAU)도 원본에 있습니다.",
  ].filter(Boolean).map((c) => `<li>${bold(c)}</li>`).join("")}</ul></section>
<p class="foot">우주라이크 · Probe 앱 주요 지표 · 내부 자료</p>`;

  return page({ title: `앱 주요 지표 ${rangeLabel(s.spec)}`, css: CSS, bar, body, wrapWidth: 960 });
}
