import PARTNER_TEMPLATE_HTML from "./partnerTemplateHtml";
import type { Json } from "./partnerMonthly";

/**
 * 사장님 월간 보고서 양식에 report-data JSON 을 끼운다.
 *
 * 앱 지표 보고서(fillAppReportTemplate)와 같은 방식이다 — 양식은 손대지 않고 JSON 블록만 간다.
 * 계산·증감칩·빈 칸 표기는 전부 양식 안의 스크립트가 한다.
 */

/** `<script type="application/json">` 안에 넣어도 안전하게 — `</script>` · 줄 구분자로 블록이 끊기지 않게 한다 */
const safeJson = (d: unknown) =>
  JSON.stringify(d, null, 2).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

const BLOCK = /(<script type="application\/json" id="report-data">)[\s\S]*?(<\/script>)/;

export const PARTNER_BODY_TAG = '<body data-report-status="ok">';

export function fillPartnerTemplate(data: Json): string {
  return PARTNER_TEMPLATE_HTML.replace(BLOCK, (_m, open: string, close: string) => `${open}\n${safeJson(data)}\n${close}`);
}

/** 보내기 전에 잡는다 — 값이 하나도 없으면 빈 종이가 나간다 */
export function partnerMissing(data: Json): string[] {
  const out: string[] = [];
  const r = (data.report ?? {}) as Record<string, unknown>;
  if (!r.label) out.push("보고 기간 이름");
  if (!r.generated_at) out.push("작성일");
  const groups = (data.groups ?? []) as { cards?: { value: unknown }[] }[];
  const filled = groups.reduce((a, g) => a + (g.cards ?? []).filter((c) => c.value !== null && c.value !== undefined).length, 0);
  if (filled === 0) out.push("숫자가 하나도 없습니다 — 이대로는 빈 종이가 나갑니다");
  return out;
}
