import type { Json } from "./appReportData";

/**
 * 슬랙에서 Probe 에게 GA4 숫자를 물을 때 쓰는 **데이터만** 응답 (민찬 1011, 백엔드 probe/slack_brain.py).
 *
 * 양식(HTML)은 읽는 사람이 눈으로 보라고 만든 것이라 AI 에게는 군더더기다. 같은 `buildAppReportData` 가 만든 값 중
 * 숫자와 그 숫자를 읽는 주의점(caveats)만 추려 준다 — 정의를 따로 쓰면 보고서와 갈라진다.
 * 내용은 보고서와 같으므로 **크론 토큰으로만** 열린다(route.ts).
 */
const METRIC_KEYS = ["key", "label", "value", "prev", "unit", "status", "status_label", "scope", "sample", "note", "verdict"] as const;

type Row = Record<string, unknown>;

const slim = (m: Row): Row => {
  const out: Row = {};
  for (const k of METRIC_KEYS) if (m[k] !== undefined && m[k] !== null) out[k] = m[k];
  return out;
};

export function botReportData(data: Json): Json {
  const groups = Array.isArray(data.groups) ? (data.groups as Row[]) : [];
  return {
    report: data.report,
    groups: groups.map((g) => ({ ...g, metrics: Array.isArray(g.metrics) ? (g.metrics as Row[]).map(slim) : [] })),
    funnel: data.funnel ?? null,
    coupon_funnel: data.coupon_funnel ?? null,
    caveats: data.caveats ?? [],
  };
}
