import { test } from "node:test";
import assert from "node:assert/strict";
import { toTemplateData, templateMissing } from "../src/lib/draft/reportTemplateData";
import { fillReportTemplate, insertAfterBody } from "../src/lib/draft/reportTemplate";
import { VERDICT_FRACTION, cohortNote, verdict } from "../src/lib/draft/report";
import { downloadBar } from "../src/lib/draft/reportDownload";
import type { ReportData, ReportMetric, StoreReport } from "../src/lib/draft/types";

const metric = (key: string, value: number, median: number | null = null, n = 0) =>
  ({ key, value, median, p10: null, p90: null, n, window_days: 90, hidden: n < 5, delta_pct: null, source: "graph" as const });

function report(over: Partial<StoreReport> = {}, snap: Partial<StoreReport["snapshot"]> = {}): StoreReport {
  return {
    id: "rep-1", token: null, restaurant_id: 1, plan_id: 9, kind: "post", status: "APPROVED",
    title: "t", summary: "저장이 평소보다 높습니다", interpretation: [], proposals: [],
    created_by: "x", created_at: "", approved_by: null, approved_at: null, linked_at: null, sent_at: null, revoked_at: null,
    views: { count: 0, first_at: null, last_at: null },
    snapshot: {
      store: { name: "라라더", campus: null },
      post: { plan_id: 9, topic: "대구 면 요리 맛집 (라라더 포함)", posted_at: "2026-09-04T11:00:00+09:00", permalink: "https://ig/p/x", format: "carousel", caption: "면 덕후들", cover_url: null, owner_name: "아윤", co_stores: 3 },
      as_of: "2026-09-19T03:00:00Z", basis: "D7", age_days: 15, collecting: false,
      metrics: [metric("views", 20000, 17085, 45), metric("reach", 15503), metric("saved", 538), metric("shares", 417), metric("likes", 240), metric("comments", 2)],
      cohort_note: null, app: null, ...snap,
    },
    ...over,
  } as StoreReport;
}

const rd: ReportData = {
  available: true, day: 14, window: "D14", measured_at: "2026-09-18",
  post: { posted_at: "2026-09-04", permalink: "https://ig/p/x", format: "carousel", thumb_url: "https://t/x.jpg", caption: "c", card_count: 9 },
  metrics: { views: 32657, reach: 18702, saved: 644, shares: 528, likes: 258, comments: 2 },
  previous: { day: 7, measured_at: "2026-09-11", saved: 538 },
  benchmarks: { total_posts: 45, saved: { prev5_avg: 272 }, views: { median: 17085, p75: 27828, rank: 10 } },
};

test("제목의 「(… 포함)」 표시는 점주에게 안 보인다", () => {
  const d = toTemplateData(report()) as { post: { title: string; type_label: string | null; store_count: number | null } };
  assert.equal(d.post.title, "대구 면 요리 맛집");
  assert.equal(d.post.type_label, "큐레이션"); // 여러 매장이 함께 실린 편
  assert.equal(d.post.store_count, 3);
});

test("report-data 가 있으면 그 수치와 며칠차를 쓴다", () => {
  const d = toTemplateData(report({}, { report_data: rd })) as { report: { day: number; measured_at: string }; metrics: Record<string, number>; previous: unknown; benchmarks: Record<string, unknown>; post: { image: string } };
  assert.equal(d.report.day, 14);
  assert.equal(d.report.measured_at, "2026-09-18");
  assert.equal(d.metrics.saved, 644);           // 스냅샷의 D+7(538) 이 아니라 D+14
  assert.equal(d.post.image, "https://t/x.jpg"); // 메타 썸네일 우선
  assert.ok(d.previous, "지난 보고 표가 들어간다");
  assert.equal((d.benchmarks as { total_posts?: number }).total_posts, 45);
});

test("report-data 가 없으면 예전 규칙 — D+7 · 코호트 중앙값만", () => {
  const d = toTemplateData(report()) as { report: { day: number }; metrics: Record<string, number>; previous: unknown; benchmarks: { views?: { median: number | null } } };
  assert.equal(d.report.day, 7);
  assert.equal(d.metrics.saved, 538);
  assert.equal(d.previous, null);
  assert.equal(d.benchmarks.views?.median, 17085);
});

test("양식 필수 값이 비면 승인 전에 잡는다", () => {
  assert.deepEqual(templateMissing(report()), []);
  const broken = report({}, { post: { ...report().snapshot.post, permalink: null, posted_at: null }, metrics: [] });
  const missing = templateMissing(broken);
  for (const label of ["게시일", "인스타그램 링크", "조회수", "도달"]) assert.ok(missing.includes(label), `${label} 을 잡아야 한다`);
});

test("문구에 </script> 를 넣어도 코드로 실행되지 않는다", () => {
  const html = fillReportTemplate(report({ summary: '</script><img src=x onerror=alert(1)>' }));
  assert.ok(!html.includes("</script><img"), "JSON 블록이 끊기면 안 된다");
  assert.ok(html.includes("\\u003c/script"), "< 는 이스케이프된다");
});

test("미리보기 띠는 주석이 아니라 진짜 <body> 뒤에 들어간다", () => {
  // 양식 머리말 주석에 <body data-report-status="ok|error"> 라는 설명 글이 먼저 나온다(0920 에 여기 끼워 넣어 안 보였다)
  const html = insertAfterBody(fillReportTemplate(report()), downloadBar({ filename: "r", canDownload: true, statusLabel: "승인됨" }));
  const bar = html.indexOf("data-preview-bar");
  assert.ok(bar > html.indexOf("-->"), "주석 뒤여야 한다");
  assert.ok(bar > html.indexOf('<body data-report-status="loading">'), "진짜 body 뒤여야 한다");
});

test("승인 전에는 파일을 받을 수 없다", () => {
  assert.ok(downloadBar({ filename: "r", canDownload: false, statusLabel: "승인 전" }).includes("disabled"));
});

// ── 순위 판정 (건수 창) ───────────────────────────────────────────────

const withBaskets = (over: Partial<ReportMetric> = {}, baskets?: ReportMetric["baskets"]): ReportMetric =>
  ({ key: "views", value: 3000, median: 2000, p10: 100, p90: 9000, n: 30, window_days: 90,
     hidden: false, delta_pct: 50, source: "graph", baskets, ...over }) as ReportMetric;

const basket = (rank: number | null, n: number) => ({ n, rank, median: 2000, pi: 150, thin: n < 5 });

test("순위가 있으면 「평소 범위 안」 대신 순위로 말한다", () => {
  const m = withBaskets({}, { recent5: basket(2, 5), recent10: basket(3, 10), all: basket(12, 48) });
  const v = verdict(m);
  assert.equal(v.tone, "good");
  assert.match(v.text, /10건 중 3위/, "분모가 문구에 보여야 한다");
  assert.doesNotMatch(v.text, /평소 범위/);
});

test("1위는 최고 기록이라고 말한다", () => {
  const m = withBaskets({}, { recent5: basket(1, 5), recent10: basket(1, 10), all: basket(1, 48) });
  assert.match(verdict(m).text, /최고 기록/);
});

test("가운데면 색을 안 칠한다 — 위·아래 1/3 만 판정", () => {
  const edge = Math.max(1, Math.floor(10 * VERDICT_FRACTION)); // 3
  assert.equal(verdict(withBaskets({}, { recent5: basket(1, 5), recent10: basket(edge, 10), all: basket(1, 48) })).tone, "good");
  assert.equal(verdict(withBaskets({}, { recent5: basket(1, 5), recent10: basket(edge + 1, 10), all: basket(1, 48) })).tone, "gray");
  assert.equal(verdict(withBaskets({}, { recent5: basket(1, 5), recent10: basket(10, 10), all: basket(1, 48) })).tone, "warn");
});

test("표본이 얕아도 순위·분모는 쓴다", () => {
  const m = withBaskets({ n: 2, hidden: true, median: null }, { recent5: basket(1, 2), recent10: basket(1, 2), all: basket(1, 2) });
  const v = verdict(m);
  assert.match(v.text, /2건 중 1위/, "표본 부족으로 흘려보내지 않는다");
  assert.equal(v.tone, "good");
});

test("baskets 가 없는 옛 스냅샷은 예전 방식 그대로", () => {
  const v = verdict(withBaskets({ value: 9500 }));
  assert.equal(v.tone, "good");
  assert.match(v.text, /평소보다 높음/);
});

test("근거 줄이 분모 셋을 다 보여 준다", () => {
  const note = cohortNote([withBaskets({}, { recent5: basket(2, 5), recent10: basket(3, 10), all: basket(12, 48) })]);
  assert.match(note!, /최근 5건 중 2위/);
  assert.match(note!, /최근 10건 중 3위/);
  assert.match(note!, /전체 48건 중 12위/);
});

// ── 이미지 프록시 (PNG·HTML 저장이 썸네일을 못 가져오던 문제) ──────────



/**
 * 0923 회귀 — 프록시를 붙이면서 상대경로(/api/img?...)를 줬더니 양식의 url() 이 통째로 걸러
 * 미리보기에서 썸네일이 사라지고 「게시물 이미지 · post.image」 자리표시가 떴다.
 * 양식이 무엇을 통과시키는지 여기서 못 박는다.
 */



test("PNG 를 만들 때 서명된 URL을 깨뜨리지 않는다", () => {
  // cacheBust 는 img src 에 쿼리를 덧붙인다 — 서명 URL이면 403 이 나서 이미지가 통째로 빠진다
  const bar = downloadBar({ filename: "x", canDownload: true, statusLabel: "승인됨" });
  assert.doesNotMatch(bar, /cacheBust:\s*true/);
});

test("HTML 저장이 이미지를 못 넣으면 그렇다고 말한다", () => {
  const bar = downloadBar({ filename: "x", canDownload: true, statusLabel: "승인됨" });
  assert.match(bar, /파일에 못 넣었습니다/, "조용히 삼키면 열어 보고서야 안다");
});

test("PNG 도 이미지를 직접 인라인한다 — 변환 도구에 맡기지 않는다", () => {
  const bar = downloadBar({ filename: "x", canDownload: true, statusLabel: "승인됨" });
  // 도구가 이미지를 못 받으면 imagePlaceholder(투명 1x1)로 갈아쳐 「크기만 남은 빈 상자」가 된다.
  // 그래서 넘기기 전에 우리가 data: 로 바꾼다 — HTML 저장이 쓰는 dataUrl() 과 같은 길.
  assert.match(bar, /function inlineImages\(\)/);
  assert.match(bar, /Promise\.all\(\[loadLib\(\), fontCss\(\), inlineImages\(\)\]\)/, "캡처 전에 인라인이 끝나야 한다");
  assert.match(bar, /i\.decode/, "새 src 가 그려질 때까지 기다려야 한다");
  assert.match(bar, /undoImgs\(\)/, "캡처 뒤 화면의 src 를 되돌려야 한다");
  assert.match(bar, /PNG .*개를 못 넣었습니다|개를 못 넣었습니다/, "실패하면 말해야 한다");
});

// ── PNG 3장 나누기 (카톡) ────────────────────────────────────────────
import REPORT_TEMPLATE_HTML from "../src/lib/draft/reportTemplateHtml";

test("PNG 는 카톡용으로 세 장을 낸다", () => {
  const bar = downloadBar({ filename: "x", canDownload: true, statusLabel: "승인됨" });
  assert.match(bar, /PNG 저장 \(3장\)/);
  assert.match(bar, /function pngPages\(\)/);
  assert.match(bar, /_" \+ p\.no \+ "\.png/, "파일 이름에 장 번호가 들어가야 한다");
  assert.match(bar, /i \* 400/, "한꺼번에 내려받으면 브라우저가 막는다");
  assert.match(bar, /function hideBar\(\)/, "장마다 반복되는 머리띠는 PNG 에서 뺀다");
});

/**
 * 양식에 구획이 새로 생겼는데 PAGES 에 안 넣으면, 그 카드가 **PNG 에서 조용히 사라진다**
 * (showOnly 가 목록에 없는 건 건드리지 않으니 화면엔 남고 PNG 에만 빠지는 게 아니라,
 *  목록 밖 구획은 어느 장에도 안 들어가 세 장 어디에도 안 나온다).
 * 양식이 가진 구획과 PAGES 가 덮는 구획이 **정확히 같아야** 한다.
 */
test("양식의 모든 구획이 세 장 어딘가에 들어간다", () => {
  const inTemplate = new Set(
    [...REPORT_TEMPLATE_HTML.matchAll(/id="(r-[a-z]+)"/g)].map((m) => m[1])
  );
  inTemplate.delete("r-errors"); // 발송 전 검사용 — 리포트 내용이 아니다

  const bar = downloadBar({ filename: "x", canDownload: true, statusLabel: "승인됨" });
  const pages = bar.match(/var PAGES = \[([\s\S]*?)\n  \];/);
  assert.ok(pages, "PAGES 를 못 찾았습니다");
  const covered = new Set([...pages[1].matchAll(/"(r-[a-z]+)"/g)].map((m) => m[1]));

  const missing = [...inTemplate].filter((id) => !covered.has(id));
  assert.deepEqual(missing, [], `양식에 있는데 어느 장에도 안 들어간 구획: ${missing.join(", ")}`);
  const extra = [...covered].filter((id) => !inTemplate.has(id));
  assert.deepEqual(extra, [], `PAGES 에 있는데 양식엔 없는 구획: ${extra.join(", ")}`);
});

// ── 이미지 읽기 (저장할 때만 프록시) ──────────────────────────────────

test("저장할 때만 /api/img 로 우회한다 — 상대경로여야 도메인을 몰라도 맞는다", () => {
  const bar = downloadBar({ filename: "x", canDownload: true, statusLabel: "승인됨" });
  assert.match(bar, /"\/api\/img\?u=" \+ encodeURIComponent\(url\)/);
  // 절대경로를 박으면 배포 도메인(app.wouldulike.kr)을 잘못 짚는 순간 다른 출처가 된다
  assert.doesNotMatch(bar, /https:\/\/[a-z0-9.-]*vercel\.app/);
  assert.match(bar, /fetchBlob\(url\)\.catch/, "곧장 읽어 보고, 막히면 우회한다");
});

test("오류를 사람이 읽을 수 있게 적는다", () => {
  const bar = downloadBar({ filename: "x", canDownload: true, statusLabel: "승인됨" });
  // 이미지 로드 실패는 Error 가 아니라 Event 로 와서 그냥 찍으면 "[object Event]" 다 (0923 에 실제로 그렇게 나왔다)
  assert.match(bar, /function why\(e\)/);
  assert.match(bar, /이미지를 불러오지 못했습니다/);
  assert.doesNotMatch(bar, /err && err\.message \? err\.message : err/);
});

test("양식 이미지는 지금 보고 있는 도메인의 프록시를 거친다", () => {
  const meta = "https://scontent-x.cdninstagram.com/v/t51/9_n.jpg?oh=abc";
  const r = report({}, { post: { ...report().snapshot.post, cover_url: meta } });

  // 메타 CDN 은 브라우저가 직접 부르면 막는다 — 프록시를 거쳐야 화면에 보인다
  const d = toTemplateData(r, { origin: "https://app.wouldulike.kr" }) as { post: { image: string } };
  assert.equal(d.post.image, `https://app.wouldulike.kr/api/img?u=${encodeURIComponent(meta)}`);

  // 출처가 다르면 저장할 때 CORS 로 막힌다 — 고정값을 쓰면 안 되는 이유
  const other = toTemplateData(r, { origin: "https://dash.vercel.app" }) as { post: { image: string } };
  assert.notEqual(other.post.image, d.post.image);

  // 출처를 모르면(필수값 검사 등) 원본 그대로 — 그 경로는 이미지를 그리지 않는다
  const none = toTemplateData(r) as { post: { image: string } };
  assert.equal(none.post.image, meta);
});

test("이미 프록시된 주소를 또 감싸지 않는다", () => {
  const bar = downloadBar({ filename: "x", canDownload: true, statusLabel: "승인됨" });
  assert.ok(bar.includes("그대로 읽는다(같은 출처라 막히지 않는다)"), "같은 출처 주소는 그대로 읽어야 한다");
  assert.ok(bar.includes(".test(url)) return fetchBlob(url).then(readAsDataUrl)"), "프록시 주소면 곧장 읽는다");
});

test("프록시가 막히면 그 이유를 문구에 싣는다", () => {
  const bar = downloadBar({ filename: "x", canDownload: true, statusLabel: "승인됨" });
  assert.match(bar, /j\.detail/, "「HTTP 403」만으로는 서명 만료인지 차단인지 모른다");
});

// ── 미리보기 띠 스크립트가 **실제로 도는가** ──────────────────────────
import vm from "node:vm";

/**
 * 0923: 템플릿 리터럴 안의 정규식에 백슬래시를 한 겹만 써서 `/\/api\/img\?/` 가 `//api/img?/` 로 나갔다.
 * `//` 가 주석이 되어 **스크립트 전체가 문법 오류**였고, 버튼을 눌러도 아무 반응이 없었다.
 * 타입 검사도 테스트도 못 잡는다 — 문자열 안의 JS 라서. 그래서 여기서 직접 파싱한다.
 */
test("띠 스크립트가 문법 오류 없이 파싱된다", () => {
  for (const can of [true, false]) {
    const bar = downloadBar({ filename: "테스트 · 리포트", canDownload: can, statusLabel: "승인됨" });
    const m = bar.match(/<script>\n([\s\S]*?)\n<\/script>/);
    assert.ok(m, "스크립트 블록이 있어야 한다");
    assert.doesNotThrow(() => new vm.Script(m![1]), `canDownload=${can} 에서 문법 오류`);
  }
});

test("띠 스크립트에 주석으로 죽은 정규식이 없다", () => {
  const js = downloadBar({ filename: "x", canDownload: true, statusLabel: "s" }).match(/<script>\n([\s\S]*?)\n<\/script>/)![1];
  // `(//` 나 `= //` 는 정규식을 쓰려다 백슬래시가 먹힌 자국이다
  for (const [i, line] of js.split("\n").entries()) {
    const code = line.trim();
    if (code.startsWith("//")) continue; // 진짜 주석 줄
    assert.ok(!/[(=,]\s*\/\//.test(code), `${i + 1}줄에서 정규식이 주석이 됐습니다: ${code.slice(0, 80)}`);
  }
});

// ── 썸네일을 스냅샷에 파일째 담는다 ───────────────────────────────────
import { embedImage, isEmbedded } from "../src/lib/draft/coverImage";

/**
 * 0923: 스냅샷에 **주소**만 넣었더니 며칠 뒤 403 이었다.
 * cover_url 은 S3 presigned TTL 600초, thumb_url 은 메타 서명 주소 — 둘 다 짧게 살다 죽는다.
 * 프록시로는 못 고친다. 서버에서 불러도 똑같이 403 이다.
 */
test("살아 있는 주소는 파일째 담는다", async () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => new Response(png, { status: 200, headers: { "Content-Type": "image/png" } })) as never;
  try {
    const out = await embedImage("https://s3.example.com/a.png?X-Amz-Signature=x");
    assert.ok(isEmbedded(out), "data: 로 담겨야 만료가 없다");
    assert.match(out!, /^data:image\/png;base64,/);
  } finally { globalThis.fetch = orig; }
});

test("못 담으면 주소를 그대로 둔다 — 리포트 만들기가 실패하면 안 된다", async () => {
  const url = "https://s3.example.com/a.png";
  const orig = globalThis.fetch;
  for (const res of [
    new Response("no", { status: 403 }),
    new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }), // 403 본문이 그림인 척
  ]) {
    globalThis.fetch = (async () => res.clone()) as never;
    assert.equal(await embedImage(url), url);
  }
  globalThis.fetch = (async () => { throw new Error("망"); }) as never;
  assert.equal(await embedImage(url), url);
  globalThis.fetch = orig;
});

test("담긴 그림은 프록시를 거치지 않는다", () => {
  const data = "data:image/png;base64,AAAA";
  const r = report({}, { post: { ...report().snapshot.post, cover_url: data } });
  const d = toTemplateData(r, { origin: "https://app.wouldulike.kr" }) as { post: { image: string } };
  assert.equal(d.post.image, data, "만료도 CORS 도 없다 — 그대로 쓴다");
  assert.doesNotMatch(d.post.image, /\/api\/img/);
});

test("빈 값·data: 는 건드리지 않는다", async () => {
  assert.equal(await embedImage(null), null);
  assert.equal(await embedImage(""), null);
  assert.equal(await embedImage("data:image/png;base64,AA"), "data:image/png;base64,AA");
});
