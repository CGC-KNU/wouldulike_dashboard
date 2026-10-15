import STORE_MONTHLY_TEMPLATE_HTML from "./storeMonthlyTemplateHtml";
import type { Json } from "./storeMonthly";

/**
 * 가게 월간 보고서 양식에 report-data JSON 을 끼운다 — 사장님 공통 월간(fillPartnerTemplate)과 같은 방식.
 * 계산·빈 칸 판단은 만드는 쪽(storeMonthly.ts)이 끝냈고, 양식은 그리기만 한다.
 */

/** `<script type="application/json">` 안에 넣어도 안전하게 — `</script>` · 줄 구분자로 블록이 끊기지 않게 한다 */
const safeJson = (d: unknown) =>
  JSON.stringify(d, null, 2).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

const BLOCK = /(<script type="application\/json" id="report-data">)[\s\S]*?(<\/script>)/;

export const STORE_MONTHLY_BODY_TAG = '<body data-report-status="ok">';

export function fillStoreMonthlyTemplate(data: Json): string {
  return STORE_MONTHLY_TEMPLATE_HTML.replace(BLOCK, (_m, open: string, close: string) => `${open}\n${safeJson(data)}\n${close}`);
}
