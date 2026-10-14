/**
 * Polaris — 우리가 향하는 방향 (민열님 0919).
 *
 * 메인의 우주선 트랙·성장률 인자·게이트 A/B/C 가 전부 여기 아래 묶인다.
 * **숫자를 어떻게 셀지**가 이 파일에 있고, 어디서 읽어 올지는 usePolaris 가, 어떻게 그릴지는 Polaris.tsx 가 맡는다.
 * 인자를 바꾸고 싶으면 이 파일만 고친다 — 화면이 따라온다.
 *
 * 원칙 하나: **모르는 값은 0 이 아니다.** 비교할 과거 값이 없으면 증감률을 내지 않고,
 * 못 재는 게이트 조건은 분모에서 뺀다. 지어낸 숫자로 우주선을 앞으로 보내면 그때부터 아무도 안 믿는다.
 */

export type Period = "week" | "month";

/** Probe 응답을 아직 읽는 중이거나 통째로 못 읽었을 때만 붙는다. 없으면 읽은 것이다. */
export type ProbeState = "loading" | "failed";

/** 화면이 읽는 원자료 — usePolaris 가 채운다. undefined = 못 읽음(0 아님). */
export interface PolarisInput {
  stores: { total: number; paid: number; totalAgo: { week?: number; month?: number }; paidAgo: { week?: number; month?: number } };
  revenue: { paid: number; billed: number; paidPrevMonth?: number };
  /**
   * Probe 앱 지표(GA4). wauAgo = 4주 전 같은 7일의 WAU — 성장률 「주」의 비교 기준.
   * state 는 그 응답을 아직 읽는 중이거나 통째로 못 읽었을 때만 붙는다.
   */
  app: { wau?: number; dauWau?: number; openToStore?: number; retentionW1?: number; wauAgo?: number; state?: ProbeState };
  /**
   * 인스타 계정 도달(Meta) — last7 = 그저께로 끝나는 7일, ago = 그 4주 전 7일. window 는 last7 의 날짜(YYYY-MM-DD).
   * Meta 인사이트가 최대 48시간 늦게 차서 끝이 어제가 아니라 그저께다.
   */
  reach: { last7?: number; ago?: number; window?: { from: string; to: string }; state?: ProbeState };
  coupon: { rate?: number };
}

export interface Growth {
  key: string;
  label: string;
  now: number | undefined;
  before: number | undefined;
  /** 백분율. 둘 다 있을 때만. */
  pct: number | null;
  unit?: string;
  /** 왜 못 냈는지 — 사람이 읽는다 */
  note?: string;
  /** 무엇을 언제부터 언제까지 셌는지 — 마우스를 올리면 보인다 */
  hint?: string;
}

const pctOf = (now?: number, before?: number): number | null =>
  now === undefined || before === undefined || before === 0 ? null : Math.round(((now - before) / before) * 1000) / 10;

/**
 * Probe 에서 오는 줄(WAU · 인스타 도달)이 증감률을 못 낼 때 그 까닭. 「연결 전」은 쓰지 않는다 — 둘 다 붙어 있어서
 * 비어 있으면 못 읽은 것이다. 1014: 앱 지표 응답을 못 받은 화면이 「Probe 연결 전」이라고 적어 아직 안 붙은 것처럼 읽혔다.
 */
function probeNote(state: ProbeState | undefined, now: number | undefined, ago: number | undefined, wk: boolean): string | undefined {
  if (state === "loading") return "읽는 중";
  if (state === "failed" || now === undefined) return "읽지 못함";
  if (!wk) return "주 단위로만 비교";
  if (ago === undefined) return "4주 전 값 없음";
  return undefined;
}

const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;

/** 성장률 인자 5개. 순서가 화면 순서다. */
export function growth(i: PolarisInput, period: Period): Growth[] {
  const ago = period === "week" ? "week" : "month";
  const wk = period === "week";
  return [
    { key: "stores", label: "파트너 매장", now: i.stores.total, before: i.stores.totalAgo[ago], pct: pctOf(i.stores.total, i.stores.totalAgo[ago]), unit: "곳" },
    { key: "paid", label: "유료 매장", now: i.stores.paid, before: i.stores.paidAgo[ago], pct: pctOf(i.stores.paid, i.stores.paidAgo[ago]), unit: "곳" },
    wk
      ? { key: "revenue", label: "월 수익 (입금)", now: i.revenue.paid, before: undefined, pct: null, note: "월 단위로만 비교" }
      : { key: "revenue", label: "월 수익 (입금)", now: i.revenue.paid, before: i.revenue.paidPrevMonth, pct: pctOf(i.revenue.paid, i.revenue.paidPrevMonth), note: i.revenue.paidPrevMonth === undefined ? "전월 값 없음" : i.revenue.paidPrevMonth === 0 ? "첫 달" : undefined },
    { key: "wau", label: "WAU", now: i.app.wau, before: wk ? i.app.wauAgo : undefined, pct: wk ? pctOf(i.app.wau, i.app.wauAgo) : null, unit: "명", note: probeNote(i.app.state, i.app.wau, i.app.wauAgo, wk) },
    { key: "reach", label: "인스타 도달 (7일)", now: i.reach.last7, before: wk ? i.reach.ago : undefined, pct: wk ? pctOf(i.reach.last7, i.reach.ago) : null, note: probeNote(i.reach.state, i.reach.last7, i.reach.ago, wk),
      hint: i.reach.window ? `${md(i.reach.window.from)}~${md(i.reach.window.to)} 우리 콘텐츠를 본 계정 수(Meta). 인사이트가 늦게 차서 그저께까지 셉니다` : undefined },
  ];
}

/** 게이트 A — 팀모델 06장 그대로. `measure` 가 null 이면 아직 못 재는 조건이다. */
export interface GateItem { label: string; measure: (i: PolarisInput) => number | null; detail: (i: PolarisInput) => string }

export const GATE_A: GateItem[] = [
  { label: "유료 매장 30곳+", measure: (i) => Math.min(1, i.stores.paid / 30), detail: (i) => `${i.stores.paid} / 30` },
  { label: "만기 재계약률 60%+", measure: () => null, detail: () => "만기 전 · 미계측" },
  { label: "월 이탈 5%↓", measure: () => null, detail: () => "첫 학기 · 미계측" },
  { label: "10개 매장 귀속 방문 3%+", measure: () => null, detail: () => "인과 카운터 · 미계측" },
  { label: "매장 CAC < 3개월 총수익", measure: () => null, detail: () => "Probe 연결 후" },
];

/** 진도 = 계측되는 조건의 평균. 하나도 못 재면 null. */
export function gateProgress(i: PolarisInput): { pct: number | null; measured: number; total: number } {
  const vals = GATE_A.map((g) => g.measure(i)).filter((v): v is number => v !== null);
  return { pct: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, measured: vals.length, total: GATE_A.length };
}

export const PHASES = [
  { key: "P1", name: "증명", where: "경북대" },
  { key: "P2", name: "길목", where: "영남대 · 계명대" },
  { key: "P3", name: "확장", where: "다른 상권" },
] as const;

export const SITE_URL = "https://wouldulike.kr";
