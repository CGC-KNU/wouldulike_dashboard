import { APP_BODY_TAG, type Json } from "./appReportData";

/**
 * 앱 지표 보고서를 **스크립트 없는 HTML 한 장**으로 — PROBE 가 #sat-probe 에 올릴 파일이다 (0927).
 *
 * 양식(templates/app-report-template.html)은 스크립트로 그린다. 그대로 보내면 스크립트를 안 돌리는
 * 뷰어(슬랙·카톡 파일 미리보기)에서 빈 화면이 된다 — 매장 리포트의 「HTML 저장」이 같은 이유로
 * 브라우저에서 다 그린 화면을 스크립트 없이 저장한다(reportDownload.ts). 크론에는 브라우저가 없으므로
 * 양식의 렌더러를 **최소 DOM** 위에서 서버가 돌린다. 렌더러가 쓰는 것은 getElementById 와 body.dataset
 * 뿐이다 — tests/appReport.test.ts 의 render() 와 같은 방법이고, 그 테스트가 이 가정을 지킨다.
 *
 * 렌더러가 남기는 발송 전 검사(data-report-status · data-report-warnings)도 같이 돌려준다.
 * status 가 error 면 빠진 값이 있다는 뜻이라 보내면 안 된다.
 */
export interface StaticReport {
  status: "ok" | "error";
  warnings: string[];
  html: string;
}

const DATA_BLOCK = /<script type="application\/json" id="report-data">\n?([\s\S]*?)\n?<\/script>/;
const RENDERER = /<script>\n?([\s\S]*?)\n?<\/script>/g;

/** `fillAppReportTemplate` 의 결과 → 다 그려진, 스크립트 없는 HTML */
export function renderAppReportStatic(filled: string): StaticReport {
  const json = filled.match(DATA_BLOCK);
  const scripts = [...filled.matchAll(RENDERER)];
  if (!json || !scripts.length) throw new Error("양식에서 report-data 블록이나 렌더러를 찾지 못했습니다 — 양식이 바뀌었는지 확인하세요");

  const nodes: Record<string, { textContent?: string; innerHTML: string }> = {
    "report-data": { textContent: json[1], innerHTML: "" },
    app: { innerHTML: "" },
    err: { innerHTML: "" },
  };
  const body = { dataset: {} as Record<string, string> };
  // 전역 document 를 바꾸지 않고 인자로 넘긴다 — 서버에서 요청 둘이 겹쳐도 서로 안 밟는다
  new Function("document", scripts[scripts.length - 1][1])({ getElementById: (id: string) => nodes[id] ?? null, body });

  const status = body.dataset.reportStatus === "ok" ? "ok" : "error";
  const warnings = (body.dataset.reportWarnings ?? "").split(" | ").filter(Boolean);
  // 바꿔 넣는 글자에 `$&` 같은 것이 섞여도 그대로 들어가게 함수로 넘긴다
  const html = filled
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>\s*/g, () => "")
    .replace('<div id="err"></div>', () => `<div id="err">${nodes.err.innerHTML}</div>`)
    .replace('<div id="app"></div>', () => `<div id="app">${nodes.app.innerHTML}</div>`)
    .replace(APP_BODY_TAG, () => `<body data-report-status="${status}">`);
  return { status, warnings, html };
}

// ── 슬랙 메시지에 올릴 숫자 ────────────────────────────────────────────
export interface SummaryLine {
  key: string;
  label: string;
  value: number | null;
  prev: number | null;
  unit: string;
}

/**
 * 메시지 본문의 세 줄 — 사용자 · 쿠폰 사용 · 스탬프 적립 (민찬 0927).
 * 보고서 데이터에서 그대로 꺼낸다. 따로 세면 메시지와 첨부 파일의 숫자가 갈라진다.
 * 월간 보고서는 쿠폰 사용 칸 이름이 `coupon_redeemed` 다(주간은 `coupon_used`).
 * 이번 달 누계 칸(scope month_to_date)은 전기 대비를 싣지 않는다 — 양식도 증감을 안 그린다.
 */
export function appReportSummary(data: Json): SummaryLine[] {
  type M = { key: string; label: string; value: number | null; prev?: number | null; unit?: string; scope?: string };
  const all = ((data.groups as { metrics: M[] }[] | undefined) ?? []).flatMap((g) => g.metrics);
  const pick = (label: string, ...keys: string[]): SummaryLine => {
    const m = keys.map((k) => all.find((x) => x.key === k)).find(Boolean);
    return {
      key: m?.key ?? keys[0],
      label,
      value: m?.value ?? null,
      prev: m && m.scope !== "month_to_date" && typeof m.prev === "number" ? m.prev : null,
      unit: m?.unit ?? "",
    };
  };
  const monthly = (data.report as { type?: string } | undefined)?.type === "monthly";
  return [
    pick(monthly ? "월간 사용자" : "주간 사용자", "wau"),
    pick("쿠폰 사용", "coupon_used", "coupon_redeemed"),
    pick("스탬프 적립", "stamp_earned"),
  ];
}
