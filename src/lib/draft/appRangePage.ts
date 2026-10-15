import { DATA_FROM, UNIT_LABEL, dashed, rangePresets, rangeQuery, RANGE_UNITS, type RangeUnit } from "./appRange";
import type { Cell } from "./appSeriesData";

/**
 * Probe · 앱 지표 보고서(원본 · 주요 지표)의 **껍데기** — 위 띠(기간 고르기 · 저장)와 문서 머리, 숫자 모양.
 *
 * 매장 리포트의 띠(reportDownload.ts)는 점주에게 보낼 PNG 를 구획 id 로 나눠 찍는다 — 이 보고서에는 그 구획이 없다.
 * 그래서 띠를 따로 둔다. 같은 규칙은 지킨다:
 *  - 띠는 `data-preview-bar` — 인쇄·HTML 저장·PNG 에서 빠진다.
 *  - HTML 저장은 **스크립트 없는** 파일 한 장(슬랙·카톡 뷰어가 스크립트를 안 돌린다). 그래프가 서버에서 그린 SVG 라 그대로 남는다.
 *  - 기간 고르기는 스크립트 없이도 도는 GET 폼이다. 스크립트는 「뽑는 중…」 안내와 저장 버튼만 맡는다.
 */

export type ReportKind = "key" | "raw";
export const KIND_PATH: Record<ReportKind, string> = { key: "/r/app/key", raw: "/r/app/raw" };
const KIND_LABEL: Record<ReportKind, string> = { key: "주요 지표", raw: "지표 원본" };
/** 위 띠의 탭 — 같은 기간으로 다른 보고서를 연다 */
const KINDS: ReportKind[] = ["key", "raw"];

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const js = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
/** 머리말·주의 문장의 **굵게** 만 HTML 로 */
export const bold = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

const KO = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });
/** 표·그래프에 찍는 숫자 — 비율·평균은 소수 한 자리, 건수는 쉼표 */
export function fmtNum(v: number, kind: "count" | "avg" | "rate"): string {
  return kind === "count" ? Math.round(v).toLocaleString("ko-KR") : KO.format(v);
}
/** 칸 하나 → 글자. 없으면 「–」 */
export function fmtCell(c: Cell, kind: "count" | "avg" | "rate"): string {
  return c.v === null ? "–" : fmtNum(c.v, kind);
}

const LIB = "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js";
const FONT_CSS = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css";
const FONT = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/static/woff2/Pretendard-";

/** 두 보고서가 같이 쓰는 바탕 — 우주라이크 팔레트(app-report-template 와 같은 값) */
export const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--navy:#050072;--peri:#6366E0;--peri2:#A5B0FC;--gold:#E0A23C;--soft:#EEF0FB;--soft2:#F6F7FF;
  --ink:#111827;--tx:#374151;--sub:#6B7280;--mut:#9CA3AF;--line:#E5E7EB;--line2:#F3F4F6;--bg:#F4F4F9;
  --good:#15803D;--bad:#B91C1C;--warn:#B45309;--warnbg:#FFFBEB;--warnln:#FDE68A;color-scheme:light}
body{background:var(--bg);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased;font-size:13px;
  font-family:"Pretendard",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif;
  -webkit-text-size-adjust:100%;word-break:keep-all;overflow-wrap:break-word}
a{color:inherit}
.wrap{max-width:var(--wrap,920px);margin:0 auto;padding:22px 16px 48px}
.head{padding:2px 4px 16px}
.head .chip{display:inline-block;font-size:11px;font-weight:700;color:var(--peri);background:var(--soft);padding:4px 10px;border-radius:999px}
h1{font-size:23px;font-weight:800;letter-spacing:-.6px;line-height:1.35;margin-top:10px}
.head .sub{margin-top:5px;font-size:12.5px;color:var(--sub)}
.card{background:#fff;border-radius:16px;border:1px solid rgba(0,0,0,.05);padding:18px 18px 16px;margin-top:12px}
.card h2{font-size:15px;font-weight:800;letter-spacing:-.3px}
.card .desc{font-size:12px;color:var(--sub);margin-top:2px}
.warn{background:var(--warnbg);border:1px solid var(--warnln);color:var(--warn);border-radius:12px;padding:10px 14px;margin-top:12px;font-size:12.5px}
.warn li{margin-left:16px}
.notes{margin-top:8px;font-size:12px;color:var(--tx)}
.notes li{margin:5px 0 0 16px}
.notes b{color:var(--ink)}
.foot{margin-top:18px;text-align:center;font-size:11px;color:var(--mut)}
`;

/** 기간 고르기 · 저장 띠 */
export function rangeBar(opts: {
  kind: ReportKind;
  /** 폼에 채울 값 — 받은 그대로(넓히기 전). 못 읽었으면 기본값 */
  form: { start: string; end: string; unit: RangeUnit };
  today: string;
  /** 「미리보기 · …」 뒤에 붙는 말. 오류 화면이면 null — 저장 버튼을 끈다 */
  status: string | null;
  filename: string;
}): string {
  const { kind, form, today, status } = opts;
  const q = rangeQuery(form);
  const can = status !== null;
  const btn = "display:inline-block;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;border:0;cursor:pointer;font-family:inherit;text-decoration:none;line-height:1.4";
  const primary = `${btn};background:#312E81;color:#fff`;
  const ghost = `${btn};background:#fff;color:#312E81;box-shadow:inset 0 0 0 1px #C7CCFB`;
  const input = "font:inherit;font-size:12px;padding:4px 6px;border:1px solid #E5D3A8;border-radius:8px;background:#fff;color:#111827";
  const tabs = KINDS
    .map((k) => k === kind
      ? `<span style="${primary}">${KIND_LABEL[k]}</span>`
      : `<a href="${KIND_PATH[k]}?${q}" style="${ghost}" data-go>${KIND_LABEL[k]}</a>`)
    .join("");
  const presets = rangePresets(today)
    .map((p) => `<a href="${KIND_PATH[kind]}?${rangeQuery(p)}" data-go style="color:#9A6414;font-weight:700">${esc(p.label)}</a>`)
    .join(" · ");
  const off = can ? "" : " disabled";
  const downloads = [
    // 원본은 표라 PNG 대신 CSV — 열이 수십 개면 그림 한 장에 안 담긴다
    kind === "raw"
      ? can ? `<a href="${KIND_PATH.raw}?${q}&amp;format=csv" download style="${primary}">CSV 저장</a>` : ""
      : `<button type="button" data-dl="png" style="${primary}"${off}>PNG 저장</button>`,
    `<button type="button" data-dl="html" style="${ghost}"${off}>HTML 저장</button>`,
    `<button type="button" data-dl="print" style="${ghost}"${off}>인쇄(PDF)</button>`,
  ].join("");

  return `
<div data-preview-bar style="background:#FFF7E6;border-bottom:1px solid #F3D9A4;padding:8px 16px;font:600 12px/1.4 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;color:#9A6414">
  <div style="display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap">
    ${tabs}
    <form method="get" action="${KIND_PATH[kind]}" data-range style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-left:6px">
      <label>시작 <input type="date" name="start" value="${dashed(form.start)}" min="${dashed(DATA_FROM)}" max="${dashed(today)}" style="${input}" required></label>
      <label>끝 <input type="date" name="end" value="${dashed(form.end)}" min="${dashed(DATA_FROM)}" max="${dashed(today)}" style="${input}" required></label>
      <label>단위 <select name="unit" style="${input}">${RANGE_UNITS.map((u) => `<option value="${u}"${u === form.unit ? " selected" : ""}>${UNIT_LABEL[u]}</option>`).join("")}</select></label>
      <button type="submit" style="${ghost}">다시 뽑기</button>
    </form>
  </div>
  <div style="display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;margin-top:6px">
    <span>빠른 선택 ${presets}</span>
  </div>
  <div style="display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;margin-top:6px">
    <span>${status === null ? "기간을 고쳐 다시 뽑아 주세요" : `미리보기 · ${esc(status)}`}</span>
    ${downloads}
    <span data-dl-msg></span>
  </div>
</div>
<style data-preview-style>@media print{[data-preview-bar]{display:none!important}}[data-preview-bar] button[disabled]{opacity:.45;cursor:not-allowed}</style>
<script>
(function () {
  var FN = ${js(opts.filename)}, LIB = ${js(LIB)}, FONT = ${js(FONT)};
  var bar = document.querySelector("[data-preview-bar]"), msg = bar.querySelector("[data-dl-msg]");
  function say(t) { msg.textContent = t; }
  // 칸마다 BigQuery 를 부르므로 처음 뽑는 기간은 10~20초 걸린다 — 빈 화면에서 기다리지 않게 알린다
  function wait() { say("뽑는 중… 처음 뽑는 기간은 10~20초 걸립니다"); bar.style.opacity = ".7"; }
  bar.querySelector("form[data-range]").addEventListener("submit", wait);
  bar.querySelectorAll("a[data-go]").forEach(function (a) { a.addEventListener("click", wait); });
  function save(blob, name) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function staticHtml() {
    var doc = document.documentElement.cloneNode(true);
    doc.querySelectorAll("script, noscript, [data-preview-bar], [data-preview-style]").forEach(function (n) { n.remove(); });
    var t = doc.querySelector("title"); if (t) t.textContent = FN;
    return "<!doctype html>\\n" + doc.outerHTML;
  }
  function loadLib() {
    if (window.htmlToImage) return Promise.resolve();
    return new Promise(function (ok, no) { var s = document.createElement("script"); s.src = LIB; s.onload = ok; s.onerror = function () { no(new Error("이미지 변환 도구를 불러오지 못했습니다")); }; document.head.appendChild(s); });
  }
  function fontCss() {
    return Promise.all([[400, "Regular"], [600, "SemiBold"], [700, "Bold"], [800, "ExtraBold"]].map(function (f) {
      return fetch(FONT + f[1] + ".woff2").then(function (r) { return r.blob(); }).then(function (b) {
        return new Promise(function (ok) { var fr = new FileReader(); fr.onload = function () { ok("@font-face{font-family:Pretendard;font-weight:" + f[0] + ";src:url(" + fr.result + ") format('woff2')}"); }; fr.readAsDataURL(b); });
      });
    })).then(function (a) { return a.join(""); }).catch(function () { return ""; });
  }
  // 보고서 본문(.wrap) 한 장. 가운데 정렬 여백이 그림에 박히지 않게 찍는 동안만 여백을 뺀다
  function png() {
    var w = document.querySelector(".wrap"), was = w.getAttribute("style");
    return Promise.all([loadLib(), fontCss()]).then(function (r) {
      w.style.margin = "0";
      return window.htmlToImage.toBlob(w, { pixelRatio: 2, backgroundColor: "#F4F4F9", fontEmbedCSS: r[1] });
    }).then(function (b) { restore(); return b; }, function (e) { restore(); throw e; });
    function restore() { if (was === null) w.removeAttribute("style"); else w.setAttribute("style", was); }
  }
  bar.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-dl]"); if (!b || b.disabled) return;
    var kind = b.getAttribute("data-dl");
    if (kind === "print") { var prev = document.title; document.title = FN; window.print(); setTimeout(function () { document.title = prev; }, 1000); return; }
    if (kind === "html") { var blob = new Blob([staticHtml()], { type: "text/html;charset=utf-8" }); save(blob, FN + ".html"); say("HTML " + Math.round(blob.size / 1024) + "KB 저장"); return; }
    say("이미지를 만드는 중… (글꼴을 받느라 몇 초 걸립니다)");
    png().then(function (blob) { save(blob, FN + ".png"); say("PNG " + Math.round(blob.size / 1024) + "KB 저장"); })
      .catch(function (err) { say("만들지 못했습니다: " + (err && err.message ? err.message : String(err))); });
  });
})();
</script>`;
}

/** 문서 한 장 — 띠는 body 바로 아래, 본문은 .wrap */
export function page(opts: { title: string; css: string; bar: string; body: string; wrapWidth?: number }): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(opts.title)}</title>
<link rel="stylesheet" href="${FONT_CSS}">
<style>${BASE_CSS}${opts.wrapWidth ? `:root{--wrap:${opts.wrapWidth}px}` : ""}${opts.css}</style>
</head>
<body>
${opts.bar}
<div class="wrap">
${opts.body}
</div>
</body>
</html>`;
}

/** 기간을 못 읽었을 때 — 띠(폼)는 그대로 두고 이유만 */
export function errorBody(title: string, detail: string): string {
  return `<div class="card" style="text-align:center;padding:40px 20px"><p style="font-size:15px;font-weight:700">${esc(title)}</p><p style="font-size:13px;color:var(--sub);margin-top:8px">${esc(detail)}</p></div>`;
}

/** 파일 이름 — 「앱지표_원본_20260901-20261012_주」 */
export function rangeFilename(kind: ReportKind, r: { start: string; end: string; unit: RangeUnit }): string {
  return `앱지표_${kind === "raw" ? "원본" : "주요지표"}_${r.start}-${r.end}_${UNIT_LABEL[r.unit]}`.replace(/[\\/:*?"<>|\s]+/g, "_");
}
