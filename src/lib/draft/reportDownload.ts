/**
 * 리포트 미리보기(/r/preview-<id>) 위에 붙는 띠 — 사장님께 카톡으로 보낼 **파일**을 만든다 (민찬 0920: 링크 대신 파일).
 *
 *  · PNG  리포트 전체를 긴 이미지 한 장(폭 640 · 2배). 카톡에서 사진처럼 바로 열린다.
 *  · HTML 다 그려진 화면을 **스크립트 없는** 파일 한 장으로 — 카톡 파일 뷰어는 스크립트를 안 돌리는 경우가 있어
 *         양식 원본(스크립트로 그리는 파일)을 보내면 빈 화면이 된다. 이미지도 파일 안에 넣는다.
 *  · 인쇄 브라우저 인쇄창(PDF 저장).
 *
 * 승인(금지 표현·양식 필수 값 검사 통과)된 리포트만 받을 수 있다 — 링크 발급 때와 같은 문턱.
 * PNG 는 html-to-image(CDN)로 브라우저에서 만든다. 폰트는 화면과 같게 Pretendard 4굵기를 직접 넣는다.
 */

const LIB = "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js";
const FONT = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/static/woff2/Pretendard-";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const js = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export function downloadBar(opts: { filename: string; canDownload: boolean; statusLabel: string }): string {
  const btn = "display:inline-block;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;border:0;cursor:pointer;font-family:inherit";
  const off = opts.canDownload ? "" : " disabled";
  return `
<div data-preview-bar style="background:#FFF7E6;border-bottom:1px solid #F3D9A4;padding:8px 16px;display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;font:600 12px/1.4 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;color:#9A6414">
  <span>미리보기 · ${esc(opts.statusLabel)}</span>
  <button type="button" data-dl="png" style="${btn};background:#312E81;color:#fff"${off}>PNG 저장 (3장)</button>
  <button type="button" data-dl="html" style="${btn};background:#fff;color:#312E81;box-shadow:inset 0 0 0 1px #C7CCFB"${off}>HTML 저장</button>
  <button type="button" data-dl="print" style="${btn};background:#fff;color:#312E81;box-shadow:inset 0 0 0 1px #C7CCFB"${off}>인쇄(PDF)</button>
  <span data-dl-msg>${opts.canDownload ? "카톡으로 보낼 파일을 받습니다" : "승인한 리포트만 받을 수 있습니다 (금지 표현·필수 값 검사)"}</span>
</div>
<style data-preview-style>@media print{[data-preview-bar]{display:none!important}}[data-preview-bar] button[disabled]{opacity:.45;cursor:not-allowed}</style>
<script>
(function () {
  var FN = ${js(opts.filename)}, CAN = ${opts.canDownload ? "true" : "false"};
  var LIB = ${js(LIB)}, FONT = ${js(FONT)};
  var FACES = [[400, "Regular"], [600, "SemiBold"], [700, "Bold"], [800, "ExtraBold"]];
  var bar = document.querySelector("[data-preview-bar]"), msg = bar.querySelector("[data-dl-msg]");
  function say(t) { msg.textContent = t; }
  function busy(on) { bar.querySelectorAll("button").forEach(function (b) { b.disabled = on || !CAN; }); }
  function dataUrl(url) {
    return fetch(url, { mode: "cors" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(function (b) { return new Promise(function (ok, no) { var f = new FileReader(); f.onload = function () { ok(f.result); }; f.onerror = no; f.readAsDataURL(b); }); });
  }
  function save(blob, name) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function loadLib() {
    if (window.htmlToImage) return Promise.resolve();
    return new Promise(function (ok, no) { var s = document.createElement("script"); s.src = LIB; s.onload = ok; s.onerror = function () { no(new Error("이미지 변환 도구를 불러오지 못했습니다")); }; document.head.appendChild(s); });
  }
  function fontCss() {
    return Promise.all(FACES.map(function (f) {
      return dataUrl(FONT + f[1] + ".woff2").then(function (u) { return "@font-face{font-family:Pretendard;font-weight:" + f[0] + ";font-display:block;src:url(" + u + ") format('woff2')}"; });
    })).then(function (a) { return a.join(""); }).catch(function () { return ""; }); // 못 받으면 시스템 글꼴로
  }

  // 다 그려진 화면 → 스크립트 없는 HTML 한 장
  function staticHtml() {
    var doc = document.documentElement.cloneNode(true);
    doc.querySelectorAll("script, noscript, [data-preview-bar], [data-preview-style], a[download]").forEach(function (n) { n.remove(); });
    var t = doc.querySelector("title"); if (t) t.textContent = FN;
    var imgs = Array.prototype.slice.call(doc.querySelectorAll("img[src]")).filter(function (i) { return !/^data:/.test(i.getAttribute("src")); });
    // 실패를 삼키면 안 된다 — 예전엔 조용히 넘어가서, 저장된 파일에 썸네일이 빠진 걸 열어 보고서야 알았다(0923).
    var missed = 0;
    return Promise.all(imgs.map(function (i) {
      return dataUrl(i.src).then(function (u) { i.setAttribute("src", u); }).catch(function () { missed++; });
    })).then(function () {
      staticHtml.missed = missed;
      return "<!doctype html>\\n" + doc.outerHTML;
    });
  }

  // 리포트 전체 → PNG (폭 640 · 2배)
  // 변환 도구는 요소마다 **지금 계산된** 스타일을 복사한다 — 넓은 화면의 가운데 정렬 여백이 그대로 박혀 오른쪽이 잘린다.
  // 그래서 만드는 동안만 실제 화면을 폰 폭(640)으로 좁혔다가 되돌린다.
  // 변환 도구에 넘기기 전에 이미지를 **직접** data: 로 바꿔 둔다.
  // 도구도 이미지를 스스로 받아 오긴 하는데, 실패하면 imagePlaceholder(투명 1x1)로 갈아치워서
  // **크기만 남은 빈 상자**가 된다 — 0923 에 PNG 썸네일 자리가 비어 나온 게 이것이다.
  // HTML 저장이 쓰는 dataUrl() 은 같은 이미지를 잘 받아 오므로(그쪽은 정상) 같은 길을 쓴다.
  function inlineImages() {
    var imgs = Array.prototype.slice.call(document.querySelectorAll("img[src]"))
      .filter(function (i) { return !/^data:/.test(i.getAttribute("src")); });
    var undo = [], missed = 0;
    return Promise.all(imgs.map(function (i) {
      var was = i.getAttribute("src");
      return dataUrl(was).then(function (u) {
        undo.push([i, was]); i.setAttribute("src", u);
        // 새 src 가 실제로 그려질 때까지 기다린다 — 안 기다리면 도구가 빈 이미지를 복사한다
        return i.decode ? i.decode().catch(function () {}) : null;
      }).catch(function () { missed++; });
    })).then(function () {
      return { missed: missed, undo: function () { undo.forEach(function (r) { r[0].setAttribute("src", r[1]); }); } };
    });
  }

  // 카톡에서 읽기 좋게 **세 장**으로 나눈다. 한 장이면 1:4.2 라 말풍선에서 가느다란 띠가 된다(0923 실측).
  // 픽셀로 자르면 글자가 잘린다 — 양식이 이미 구획(id)으로 나뉘어 있으므로 **그 경계로** 자른다.
  // 빈 구획(앱 카드·지난 보고·업셀은 없을 때가 있다)은 그냥 아무것도 안 그린다.
  var PAGES = [
    { no: 1, ids: ["r-head", "r-post"] },
    { no: 2, ids: ["r-metrics", "r-app", "r-change", "r-compare"] },
    { no: 3, ids: ["r-insight", "r-upsell", "r-foot"] }
  ];
  var ALL_IDS = PAGES.reduce(function (a, p) { return a.concat(p.ids); }, []);

  /** 이 장에 안 들어가는 구획만 숨긴다. 되돌리는 함수를 준다. */
  function showOnly(ids) {
    var was = [];
    ALL_IDS.forEach(function (id) {
      var n = document.getElementById(id); if (!n) return;
      was.push([n, n.style.display]);
      n.style.display = ids.indexOf(id) < 0 ? "none" : "";
    });
    return function () { was.forEach(function (w) { w[0].style.display = w[1]; }); };
  }

  /** 머리띠에 "1/3" 을 잠깐 붙인다 — 카톡 앨범에서는 파일 이름이 안 보인다. */
  function pageMark(no, total) {
    var host = document.querySelector(".bar"); if (!host) return function () {};
    var el = document.createElement("span");
    el.textContent = " " + no + "/" + total;
    el.setAttribute("data-page-mark", "1");
    host.appendChild(el);
    return function () { el.remove(); };
  }

  function png() {
    var W = 640, body = document.body, prev = body.getAttribute("style"), undoImgs = null;
    return Promise.all([loadLib(), fontCss(), inlineImages()]).then(function (r) {
      undoImgs = r[2].undo; png.missed = r[2].missed;
      body.style.width = W + "px"; body.style.margin = "0";
      return new Promise(function (ok) { requestAnimationFrame(function () { requestAnimationFrame(ok); }); }).then(function () {
        return window.htmlToImage.toBlob(body, {
          width: W, height: reportBottom(), pixelRatio: 2, backgroundColor: "#F1F2F7", fontEmbedCSS: r[1],
          // cacheBust 는 쓰지 않는다 — 붙이는 쿼리가 **서명된 URL을 깨뜨려** 403 이 난다.
          // 이미지는 우리 도메인(/api/img)을 거치고 거기서 짧게 캐시하므로 굳이 우회할 이유도 없다.
          imagePlaceholder: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
          filter: function (n) { return !(n.hasAttribute && (n.hasAttribute("data-preview-bar") || n.hasAttribute("data-preview-style"))) && n.tagName !== "SCRIPT" && n.tagName !== "NOSCRIPT"; }
        });
      });
    }).then(function (blob) { restore(); return blob; }, function (err) { restore(); throw err; });
    // 리포트 끝(바닥글)까지만 — body 높이로 자르면 아래에 빈 공간이 남는다. 미리보기 띠 높이는 뺀다.
    function reportBottom() { var w = document.querySelector(".wrap"); return Math.ceil(w.getBoundingClientRect().bottom + window.scrollY - bar.getBoundingClientRect().height); }
    function restore() {
      if (prev === null) body.removeAttribute("style"); else body.setAttribute("style", prev);
      if (undoImgs) { undoImgs(); undoImgs = null; }  // 화면의 src 를 되돌린다 — 안 되돌리면 페이지가 무거워진 채로 남는다
    }
  }
  /** 세 장을 차례로. 한 번에 한 장만 화면에 두고 찍는다 — 레이아웃이 섞이지 않는다. */
  function pngPages() {
    var out = [], total = PAGES.length;
    return PAGES.reduce(function (chain, p) {
      return chain.then(function () {
        var back = showOnly(p.ids), unmark = pageMark(p.no, total);
        return png().then(function (blob) { back(); unmark(); out.push({ no: p.no, blob: blob }); },
                          function (e) { back(); unmark(); throw e; });
      });
    }, Promise.resolve()).then(function () { return out; });
  }

  window.__reportFiles = { png: png, pngPages: pngPages, html: staticHtml }; // 점검용

  bar.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-dl]"); if (!b || !CAN) return;
    var kind = b.getAttribute("data-dl");
    if (kind === "print") { var prev = document.title; document.title = FN; window.print(); setTimeout(function () { document.title = prev; }, 1000); return; }
    busy(true); say(kind === "png" ? "이미지를 만드는 중… (글꼴을 받느라 몇 초 걸립니다)" : "파일을 만드는 중…");
    var job = kind === "png"
      ? pngPages().then(function (pages) {
          // 한꺼번에 내려받으면 브라우저가 막는다 — 조금씩 띄운다
          pages.forEach(function (p, i) { setTimeout(function () { save(p.blob, FN + "_" + p.no + ".png"); }, i * 400); });
          var kb = Math.round(pages.reduce(function (a, p) { return a + p.blob.size; }, 0) / 1024);
          say("PNG " + pages.length + "장 저장 (" + kb + "KB)" + (png.missed ? " — 이미지 " + png.missed + "개를 못 넣었습니다" : ""));
        })
      : staticHtml().then(function (html) {
          var blob = new Blob([html], { type: "text/html;charset=utf-8" }); save(blob, FN + ".html");
          say("HTML " + Math.round(blob.size / 1024) + "KB 저장" + (staticHtml.missed ? " — 이미지 " + staticHtml.missed + "개를 파일에 못 넣었습니다" : ""));
        });
    job.catch(function (err) { say("만들지 못했습니다: " + (err && err.message ? err.message : err)); }).then(function () { busy(false); });
  });
  if (CAN && /[?&]print=1/.test(location.search)) setTimeout(function () { document.title = FN; window.print(); }, 600);
})();
</script>`;
}
