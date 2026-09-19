import REPORT_TEMPLATE_HTML from "./reportTemplateHtml";
import { toTemplateData } from "./reportTemplateData";
import type { StoreReport } from "./types";

/**
 * 양식 HTML 에 report-data JSON 을 끼운다 — 서버 전용(양식 원문 35KB 를 브라우저 번들에 싣지 않으려고 데이터 변환과 나눴다).
 * 변환 규칙은 reportTemplateData.ts.
 */

/** `<script type="application/json">` 안에 넣어도 안전하게 — `</script>` · `<!--` 로 블록이 끊기지 않게 한다 */
const safeJson = (d: unknown) => JSON.stringify(d, null, 2).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

const BLOCK = /(<script type="application\/json" id="report-data">)[\s\S]*?(<\/script>)/;

export function fillReportTemplate(r: StoreReport, opts: { beaconToken?: string } = {}): string {
  let html = REPORT_TEMPLATE_HTML.replace(BLOCK, (_m, open: string, close: string) => `${open}\n${safeJson(toTemplateData(r))}\n${close}`);
  // 열람 1회 — 같은 브라우저 세션에서 한 번. 크롤러는 JS 를 안 돌려 자동으로 빠진다(예전 ViewBeacon 과 같은 규칙).
  if (opts.beaconToken && /^[0-9a-f]{40}$/.test(opts.beaconToken)) {
    const t = opts.beaconToken;
    html = html.replace(
      "</body>",
      `<script>try{var k="r-viewed-${t}";if(!sessionStorage.getItem(k)){sessionStorage.setItem(k,"1");fetch("/api/r/${t}/view",{method:"POST",keepalive:true}).catch(function(){})}}catch(e){}</script>\n</body>`
    );
  }
  return html;
}
