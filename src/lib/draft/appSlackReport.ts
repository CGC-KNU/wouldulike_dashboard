import { dashed, parseRange, shiftDays, type RangeParse } from "./appRange";
import { isGa4Row, kpiFacts, KEY_KPIS, PREV } from "./appKeyReport";
import { fmtNum } from "./appRangePage";
import type { AppSeries } from "./appSeriesData";

/**
 * Probe 가 #sat-probe 에 올리는 **앱 지표 주간·월간 보고서** — 주요 지표 보고서로 바꿨다(민찬 1015).
 *
 * 예전에는 옛 양식(app-report-template) HTML 한 장과 숫자 세 줄(사용자 · 쿠폰 사용 · 스탬프 적립)이었다.
 * 이제 첨부는 주요 지표 보고서(그래프) HTML 한 장, 본문은 그 보고서 위 KPI 여섯 줄이다 — 같은 kpiFacts 를 읽어
 * 본문과 첨부의 숫자가 갈라지지 않는다.
 *
 *  - 주간: 그 주(월~일)까지 **12주**를 주 단위로. KPI 는 그 주 vs 전주.
 *  - 월간: 그 달까지 **6개월**을 월 단위로. KPI 는 그 달 vs 전월.
 *
 * 여기는 순수 함수만 둔다(가져오기는 app-report/cron 라우트) — 테스트가 돈다.
 */

export type SlackType = "weekly" | "monthly";
export const SLACK_WEEKS = 12;
export const SLACK_MONTHS = 6;

/**
 * 게시할 기간. `target` 은 주간이면 그 주 일요일(YYYYMMDD), 월간이면 "YYYY-MM".
 * 칸 계산은 화면·보고서와 같은 parseRange — 3/1 앞으로는 가지 않는다.
 */
export function slackRange(type: SlackType, target: string, today: string): RangeParse {
  if (type === "weekly") {
    return parseRange({ start: dashed(shiftDays(target, -(SLACK_WEEKS * 7 - 1))), end: dashed(target), unit: "week" }, today);
  }
  const y = +target.slice(0, 4), m = +target.slice(5, 7);
  const first = new Date(Date.UTC(y, m - SLACK_MONTHS, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return parseRange({ start: first, end: last, unit: "month" }, today);
}

export interface SlackLine {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  /** 「▲ 20%」 「▼ 0.4%p」 — 앞 칸이 없거나 진행 중이면 null */
  delta: string | null;
  /** 판정을 미룬 까닭 — 없으면 "" */
  hold: string;
  /** GA4 가 그 주(달) 끝까지 안 들어온 GA4 줄 — 「집계 중」 */
  pending: boolean;
  /** 값이 없는 이유 */
  why?: string;
}

/** 본문 여섯 줄 — 그 주(달) = 마지막 칸에 묶는다. 첨부 보고서의 KPI 와 같은 값이다 */
export function slackLines(s: AppSeries, ready: boolean): SlackLine[] {
  const focus = s.buckets.length - 1;
  return KEY_KPIS.map(({ key, label }) => {
    const f = kpiFacts(s, key, label, focus);
    if (!f) return { key, label, value: null, unit: "", delta: null, hold: "", pending: false, why: "지표 없음" };
    const pending = !ready && isGa4Row(f.row);
    return {
      key, label,
      value: pending ? null : f.cell.v,
      unit: f.row.unit,
      delta: pending ? null : f.delta?.text ?? null,
      hold: pending ? "" : f.hold,
      pending,
      ...(f.cell.v === null && f.cell.why ? { why: f.cell.why } : {}),
    };
  });
}

export interface SlackMessageInput {
  type: SlackType;
  /** 「10월 2주차」 · 「2026년 9월」 */
  label: string;
  /** 그 주(달) — YYYY-MM-DD */
  range: { start: string; end: string };
  lines: SlackLine[];
  ready: boolean;
  /** GA4 확정 테이블이 어디까지(YYYYMMDD) */
  through: string | null;
  /** 데이터를 못 읽은 것 — 사람이 읽을 문장 */
  warnings: string[];
  /** 대시보드에서 같은 보고서를 여는 주소(로그인 필요) */
  link: string;
}

const mdDay = (s: string) => {
  const t = s.replace(/-/g, "");
  return `${+t.slice(4, 6)}/${+t.slice(6, 8)}`;
};

/** #sat-probe 본문(슬랙 mrkdwn). GA4 가 끝까지 안 들어왔으면 GA4 줄만 「집계 중」 — 엿새치를 한 주 값처럼 올리지 않는다 */
export function slackMessage(m: SlackMessageInput): string {
  const weekly = m.type === "weekly";
  const cmp = PREV[weekly ? "week" : "month"];
  const out = [
    weekly
      ? `:bar_chart: *앱 지표 주간 보고서 · ${m.label}* (${mdDay(m.range.start)}~${mdDay(m.range.end)})`
      : `:bar_chart: *앱 지표 월간 보고서 · ${m.label}*`,
  ];
  for (const l of m.lines) {
    if (l.pending) { out.push(`• ${l.label} — 집계 중`); continue; }
    if (l.value === null) { out.push(`• ${l.label} — 읽지 못함${l.why && l.why !== "못 읽음" ? ` (${l.why})` : ""}`); continue; }
    const v = `${fmtNum(l.value, l.unit === "%" ? "rate" : "count")}${l.unit}`;
    out.push(`• ${l.label} *${v}*${l.delta ? ` · ${cmp} 대비 ${l.delta}` : ""}${l.hold ? ` _(판정 유보 — ${l.hold})_` : ""}`);
  }
  if (!m.ready) {
    out.push(`_GA4 가 ${mdDay(m.range.end)} 데이터를 아직 안 보냈습니다${m.through ? ` — 첨부의 GA4 칸은 ${mdDay(m.through)}까지 센 값입니다` : ""}._`);
  }
  for (const w of m.warnings.slice(0, 3)) out.push(`:warning: ${w}`);
  if (m.warnings.length > 3) out.push(`:warning: 외 ${m.warnings.length - 3}건`);
  out.push(`첨부: 최근 ${weekly ? `${SLACK_WEEKS}주` : `${SLACK_MONTHS}개월`} 그래프 HTML · <${m.link}|대시보드에서 열기>`);
  return out.join("\n");
}
