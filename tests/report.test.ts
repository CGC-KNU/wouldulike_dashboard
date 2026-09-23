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
