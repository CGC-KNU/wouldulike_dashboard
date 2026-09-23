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

export function fillReportTemplate(r: StoreReport, opts: { beaconToken?: string; origin?: string } = {}): string {
  const data = toTemplateData(r, { origin: opts.origin });
  let html = REPORT_TEMPLATE_HTML.replace(BLOCK, (_m, open: string, close: string) => `${open}\n${safeJson(data)}\n${close}`);
  // 게시물 사진이 없으면 양식은 "게시물 이미지 / post.image" 자리표시를 크게 띄운다(자동화 점검용). 점주에게는 빈 칸이라 숨긴다.
  if (!(data.post as { image?: string }).image) html = html.replace("</head>", "<style>.post .shot{display:none}</style>\n</head>");
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

/**
 * 양식의 진짜 <body> 바로 뒤에 끼운다. `/<body[^>]*>/` 로 찾으면 안 된다 — 양식 머리말 **주석 안에**
 * `<body data-report-status="ok|error">` 라는 설명 글이 먼저 나와서, 거기(주석 속)에 들어가 화면에 안 보인다.
 */
const BODY_TAG = '<body data-report-status="loading">';
export function insertAfterBody(html: string, fragment: string, bodyTag: string = BODY_TAG): string {
  const i = html.indexOf(bodyTag);
  if (i < 0) throw new Error(`리포트 양식에서 <body> 를 찾지 못했습니다 — 양식이 바뀌었는지 확인하세요 (찾던 것: ${bodyTag})`);
  return html.slice(0, i + bodyTag.length) + "\n" + fragment + html.slice(i + bodyTag.length);
}
