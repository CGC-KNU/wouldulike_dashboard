/**
 * 양식 HTML → TS 문자열. 지금 두 벌을 싣는다.
 *
 *   templates/app-report-template.html      → src/lib/draft/appReportTemplateHtml.ts      (앱 지표, 내부용)
 *   templates/partner-monthly-template.html → src/lib/draft/partnerTemplateHtml.ts        (사장님 월간)
 *
 * 인수 없이 돌리면 **둘 다** 만든다.
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

// 양식마다 미리보기 띠가 붙을 자리. 양식 머리말 주석 안에도
// <body data-report-status="ok|error"> 라는 설명 글이 있어, 태그 전체로 찾아야 주석에 안 걸린다.
const TEMPLATES = [
  {
    src: "templates/app-report-template.html",
    out: "src/lib/draft/appReportTemplateHtml.ts",
    name: "APP_REPORT_TEMPLATE_HTML",
    title: "우주라이크 앱 지표 보고서 양식",
    bodyTag: '<body data-report-status="ok">',
    filler: "fillAppReportTemplate()(appReportData.ts)",
  },
  {
    src: "templates/partner-monthly-template.html",
    out: "src/lib/draft/partnerTemplateHtml.ts",
    name: "PARTNER_TEMPLATE_HTML",
    title: "우주라이크 제휴 가게 사장님 월간 보고서 양식",
    bodyTag: '<body data-report-status="ok">',
    filler: "fillPartnerTemplate()(partnerTemplate.ts)",
  },
];

const want = process.argv.slice(2);
const picked = want.length ? TEMPLATES.filter((t) => want.some((w) => t.src.includes(w) || t.out.includes(w))) : TEMPLATES;
if (!picked.length) {
  console.error(`고를 양식이 없습니다 — ${TEMPLATES.map((t) => t.src).join(" · ")}`);
  process.exit(1);
}

for (const t of picked) {
  const SRC = path.join(process.cwd(), t.src);
  const OUT = path.join(process.cwd(), t.out);
  const html = fs.readFileSync(SRC, "utf8");
  if (!html.includes('<script type="application/json" id="report-data">')) {
    console.error(`${t.src} 에 report-data 블록이 없습니다 — 채울 자리가 사라졌습니다.`);
    process.exit(1);
  }
  if (!html.includes(t.bodyTag)) {
    console.error(`${t.src} 에 ${t.bodyTag} 가 없습니다 — 미리보기 띠가 붙을 자리입니다.`);
    process.exit(1);
  }

  const lines = html.split("\n").map((l) => `  ${JSON.stringify(l)},`).join("\n");
  const out = `/**
 * ${t.title} (${t.src}) — 원문 그대로.
 *
 * 이 파일은 **생성물이다. 손으로 고치지 않는다.** 양식이 바뀌면 원본 HTML 을 고치고
 * \`node scripts/embed-report-template.mjs\` 를 다시 돌린다.
 *
 * 채우는 건 ${t.filler} 이 id="report-data" JSON 블록만 갈아 끼워서 한다 —
 * 계산·증감칩·빈 칸 표기는 전부 양식 안의 스크립트가 한다.
 */
// prettier-ignore
const ${t.name} = [
${lines}
].join("\\n");
export default ${t.name};
`;
  fs.writeFileSync(OUT, out, "utf8");
  console.log(`${path.relative(process.cwd(), OUT)} — ${html.split("\n").length}줄 · ${html.length}자`);
}
