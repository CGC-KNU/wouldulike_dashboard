/**
 * templates/app-report-template.html → src/lib/draft/appReportTemplateHtml.ts
 *
 * 매장 리포트 양식(reportTemplateHtml.ts)은 String.raw`...` 로 원문을 그대로 박아 두었다. 그게 되는 건
 * 인스타 양식 안에 백틱이 **하나도 없어서**다. 앱 지표 양식은 렌더러를 템플릿 리터럴로 써서 백틱 136개 ·
 * `${` 114개가 들어 있다 — String.raw 에 그대로 넣으면 문자열이 끊기고, 백슬래시로 escape 하면
 * String.raw 특성상 백슬래시가 결과에 남아 양식이 깨진다.
 *
 * 그래서 줄 단위로 JSON 문자열 리터럴을 만들어 join 한다. 줄 단위라 diff 가 사람이 읽을 수 있는 모양으로 남는다.
 * 양식을 고쳤으면 `node scripts/embed-app-report-template.mjs` 를 다시 돌린다. 생성된 .ts 는 손으로 고치지 않는다.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "templates/app-report-template.html");
const OUT = path.join(process.cwd(), "src/lib/draft/appReportTemplateHtml.ts");

// appReport.ts 의 APP_BODY_TAG 와 같아야 한다 — 미리보기 띠가 붙을 자리다.
// 양식 머리말 주석 안에도 <body data-report-status="ok|error"> 라는 설명 글이 있어, 태그 전체로 찾아야 주석에 안 걸린다.
const APP_BODY_TAG = '<body data-report-status="ok">';

const html = fs.readFileSync(SRC, "utf8");
if (!html.includes('<script type="application/json" id="report-data">')) {
  console.error("양식에 report-data 블록이 없습니다 — 채울 자리가 사라졌습니다.");
  process.exit(1);
}
if (!html.includes(APP_BODY_TAG)) {
  console.error(`양식에 ${APP_BODY_TAG} 가 없습니다 — insertAfterBody 가 붙을 자리입니다.`);
  process.exit(1);
}

const lines = html.split("\n").map((l) => `  ${JSON.stringify(l)},`).join("\n");
const out = `/**
 * 우주라이크 앱 지표 보고서 양식 (templates/app-report-template.html) — 원문 그대로.
 *
 * 이 파일은 **생성물이다. 손으로 고치지 않는다.** 양식이 바뀌면 원본 HTML 을 고치고
 * \`node scripts/embed-app-report-template.mjs\` 를 다시 돌린다.
 *
 * 채우는 건 fillAppReportTemplate()(appReport.ts) 이 id="report-data" JSON 블록만 갈아 끼워서 한다 —
 * 계산·증감칩·퍼널 전환율·빈 칸 표기는 전부 양식 안의 스크립트가 한다.
 */
// prettier-ignore
const APP_REPORT_TEMPLATE_HTML = [
${lines}
].join("\\n");
export default APP_REPORT_TEMPLATE_HTML;
`;
fs.writeFileSync(OUT, out, "utf8");
console.log(`${path.relative(process.cwd(), OUT)} — ${html.split("\n").length}줄 · ${html.length}자`);
