import { test } from "node:test";
import assert from "node:assert/strict";
import { measuredPoint, toTemplateData, templateMissing } from "../src/lib/draft/reportTemplateData";
import { fillReportTemplate, insertAfterBody } from "../src/lib/draft/reportTemplate";
import { DEFAULT_SUMMARY, VERDICT_FRACTION, buildReportText, cardValue, checkText, cohortNote, curationIntro, day7Line, headlineBefore1005, isAutoSummary, ownerHeadline, ownerNumbers, ownerParagraphs, ownerStory, propose, reelWatchLine, refreshText, storyBefore1002, storyBefore1003, stripChannelCompare, verdict } from "../src/lib/draft/report";
import { downloadBar, PLACEHOLDER_GIF } from "../src/lib/draft/reportDownload";
import { DOWNLOADABLE, reportFilename, reportPageHtml, reportPermalink } from "../src/lib/draft/reportPage";
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
  // 1002: 큐레이션 소개 문단이 글에 들어가면 양식의 「혼자 받은 숫자가 아닙니다」 스위치(store_count)는 끈다
  assert.equal(d.post.store_count, null);
});

test("report-data 가 있으면 그 수치와 며칠차를 쓴다", () => {
  const d = toTemplateData(report({}, { report_data: rd })) as { report: { day: number; measured_at: string }; metrics: Record<string, number>; previous: unknown; benchmarks: Record<string, unknown>; post: { image: string } };
  assert.equal(d.report.day, 14);
  assert.equal(d.report.measured_at, "2026-09-18");
  assert.equal(d.metrics.saved, 644);           // 스냅샷의 D+7(538) 이 아니라 D+14
  assert.equal(d.post.image, "https://t/x.jpg"); // 메타 썸네일 우선
  assert.ok(d.previous, "지난 보고 값은 그대로 넘긴다 — 양식의 앱 카드가 쓴다");
  assert.deepEqual(d.benchmarks, {}, "우리 계정 비교값은 점주 리포트에 넣지 않는다");
});

test("report-data 가 없으면 예전 규칙 — D+7 · 코호트 중앙값도 넣지 않는다", () => {
  const d = toTemplateData(report()) as { report: { day: number }; metrics: Record<string, number>; previous: unknown; benchmarks: Record<string, unknown> };
  assert.equal(d.report.day, 7);
  assert.equal(d.metrics.saved, 538);
  assert.equal(d.previous, null);
  assert.deepEqual(d.benchmarks, {});
});

test("점주 리포트 HTML 에 우리 계정 평균·중앙값·순위가 실리지 않는다 — 소스 보기로도", () => {
  const html = fillReportTemplate(report({}, { report_data: rd }));
  const json = /<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
  const data = JSON.parse(json) as { benchmarks: Record<string, unknown> };
  assert.deepEqual(data.benchmarks, {});
  for (const v of ["17085", "27828", "prev5_avg", "total_posts"]) assert.ok(!json.includes(v), `${v} 가 JSON 에 남았다`);
});

// ── 점주 문장: 우리 채널과 견주지 않는다 (0925 마케팅 피드백) ─────────────

const CHANNEL = /우리 채널|평소|가운데 값|번째|건 중|위\)|낮았|적었|적게/;

// ── 0928: 해석 문단은 마케팅이 쓴 기프트버거 글의 형식 ─────────────────
const GIFT_TEXT = `이번 기프트버거 콘텐츠 성과를 정리해 전달드립니다.
해당 콘텐츠는 총 3,482명의 이용자에게 도달했으며, 조회수는 6,674회를 기록했습니다. 도달은 게시물을 한 번 이상 본 계정의 수이고, 조회는 게시물이 화면에 나타난 횟수를 모두 센 값입니다. 조회수가 도달한 이용자 수를 넘어섰다는 것은, 게시물을 한 번 넘게 본 이용자가 있었다는 뜻입니다.
이용자 반응 가운데서는 공유가 105회로 가장 많았습니다. 공유는 게시물을 다른 사람에게 직접 보내는 행동입니다. 이번 콘텐츠는 처음 본 이용자에게서 끝나지 않고, 그 주변 사람들에게까지 한 번 더 전달되었습니다.
저장은 67회로 집계되었습니다. 저장은 게시물을 나중에 다시 볼 수 있도록 자신의 보관함에 담아 두는 기능입니다. 이번 콘텐츠는 67회 저장되어, 그만큼 이용자들의 보관함에 기프트버거 소개가 남게 되었습니다. 이 밖에 좋아요는 66개를 기록했습니다.`;

/** report-data(카드가 쓰는 값)만 기프트버거 숫자로 — 스냅샷 지표는 일부러 다르게 둔다 */
const gift = () => ({
  ...report().snapshot, store: { name: "기프트버거", campus: null },
  metrics: [metric("views", 1000), metric("reach", 900), metric("saved", 11)],
  report_data: { ...rd, metrics: { views: 6674, reach: 3482, shares: 105, saved: 67, likes: 66, comments: 3 } },
});

test("0928~1001 글은 기프트버거 숫자를 넣으면 마케팅이 쓴 글과 글자까지 같다 — 이미 만든 리포트의 자동 문장을 알아보는 기준", () => {
  assert.equal(storyBefore1002(gift()).join("\n"), GIFT_TEXT);
});

// ── 1002: 해석 문단 — 큐레이션 소개 · 조회수 · 반응 수 (마케팅 피드백) ─────────────
const GIFT_M = { views: 6674, reach: 3482, shares: 105, saved: 67, likes: 66, comments: 3, total_interactions: 241 };
/** 기프트버거 편 — 제목에 「(… 포함)」 표시가 있는 큐레이션 */
const fresh = (metrics: Record<string, number | null> = GIFT_M, topic = "대구 수제버거 맛집 (기프트버거 포함)") =>
  ({ ...gift(), post: { ...gift().post, topic, co_stores: 1 }, report_data: { ...rd, metrics } });

const NEW_TEXT = `이번 기프트버거 콘텐츠 성과를 정리해 전달드립니다.
이번 콘텐츠는 대구 수제버거 맛집 여러 곳을 함께 큐레이션하는 방식으로 제작되었습니다. 이를 통해 기프트버거가 대표적인 대구 수제버거 맛집 중 하나로 자연스럽게 소개되었으며, 타깃 고객층에게 브랜드 인지도를 높이고 긍정적인 이미지를 형성하는 데 도움이 되었을 것으로 보입니다.
이번 콘텐츠는 조회수 6,674회를 기록했습니다.
그리고 이번 콘텐츠를 본 분들이 좋아요·저장·공유·댓글로 모두 241회 반응했습니다. 그냥 지나치지 않고 어떤 형태로든 반응을 남겼다는 뜻입니다.`;

test("1002~1003 새벽 글은 그대로 남아 있다 — 그때 만든 리포트의 자동 문장을 알아보는 기준", () => {
  assert.equal(storyBefore1003(fresh()).join("\n"), NEW_TEXT);
  // 그 글이 박힌 리포트는 그릴 때 지금 글(1003 마케팅 글)로 바뀐다
  assert.deepEqual(ownerParagraphs([...storyBefore1003(fresh()), "사람이 쓴 줄"], fresh()), [...ownerStory(fresh()), "사람이 쓴 줄"]);
});

test("큐레이션 소개는 제목에 「(… 포함)」 표시가 있을 때만 — 협찬 단독은 큐레이션이 아니다", () => {
  assert.equal(curationIntro(fresh(GIFT_M, "교동후추 협찬")), null);
  const solo = ownerStory(fresh(GIFT_M, "교동후추 협찬"));
  assert.equal(solo.length, 3, "인사 · 조회수 · 반응 수");
  assert.doesNotMatch(solo.join(" "), /큐레이션/);
  // 몇 곳인지는 데이터에 없다 — 숫자를 지어내지 않는다
  assert.match(curationIntro(fresh())!, /여러 곳을 함께 큐레이션/);
  assert.doesNotMatch(curationIntro(fresh())!, /\d/);
});

test("팔로워·도달·계정 전체 이야기를 하지 않는다 · 반응을 하나씩 세우지 않는다", () => {
  const t = ownerStory(fresh()).join(" ");
  assert.doesNotMatch(t, /팔로워|팔로우|도달|본 사람|우주라이크 콘텐츠/);
  assert.doesNotMatch(t, /(좋아요|저장|공유|댓글)(는|은|이|가)? [\d,]+/);
  assert.doesNotMatch(t, /가장 많았습니다/);
  assert.doesNotMatch(t, CHANNEL);
});

test("숫자는 리포트 카드와 같은 출처(report-data)를 쓴다", () => {
  const t = ownerStory(fresh()).join(" ");
  assert.match(t, /6,674회/);
  assert.doesNotMatch(t, /1,000회|900명/);
});

test("반응 수 — total_interactions 가 없으면 넷을 더하고, 10 미만이면 문단이 없다", () => {
  const { total_interactions: _, ...four } = GIFT_M;
  assert.match(ownerStory(fresh(four)).at(-1)!, /총반응 수는 241건으로 집계되었습니다/);
  assert.ok(!ownerStory(fresh({ ...GIFT_M, total_interactions: 7 })).some((t) => t.includes("총반응 수")));
});

test("해석 문단은 승인 가드를 통과한다 — 넷을 더한 반응 수도 스냅샷 값이다", () => {
  for (const s of [fresh(), fresh((({ total_interactions: _, ...four }) => four)(GIFT_M))]) {
    const r = checkText(ownerStory(s).join("\n"), s);
    assert.ok(r.ok, r.problems.join(", "));
  }
});

test("편집 화면 한도(한 줄 300자 · 6줄) 안에 든다 — 가장 긴 경우", () => {
  const s = { ...fresh({ views: 1234567, reach: 987654, saved: 123456, shares: 234567, likes: 345678, comments: 45678, total_interactions: 749379 },
    "대구 경북대 북문 수제버거 브런치 맛집 (아주아주긴가게이름수제버거본점 포함)"), store: { name: "아주아주긴가게이름수제버거본점", campus: null } };
  const out = ownerStory(s);
  assert.ok(out.length <= 6);
  for (const t of out) assert.ok(t.length <= 300, `${t.length}자: ${t.slice(0, 30)}…`);
});

test("이미 만든 리포트의 0928~1001 글은 그릴 때 1002 글로 갈아 끼운다 — 사람이 쓴 문장은 뒤에 남긴다", () => {
  const s = fresh();
  const out = ownerParagraphs([...storyBefore1002(s), "사장님 메뉴가 특히 반응이 좋았습니다."], s);
  assert.deepEqual(out, [...ownerStory(s), "사장님 메뉴가 특히 반응이 좋았습니다."]);
});

test("소개 문단이 들어가면 「N곳을 함께 소개한 큐레이션입니다」를 또 붙이지 않는다 — 사람이 글을 다 고쳤으면 그대로 붙는다", () => {
  type D = { insight: { paragraphs: string[]; limitation: string | null }; post: { multi_store: boolean; store_count: number | null } };
  const auto = toTemplateData(report()) as D; // 라라더 편 — 표시가 있고 co_stores 3
  assert.ok(auto.insight.paragraphs.some((t) => t.includes("여러 곳을 함께 큐레이션")));
  assert.equal(auto.insight.limitation, null);
  assert.equal(auto.post.multi_store, false, "양식이 「혼자 받은 숫자가 아닙니다」를 붙이지 않게");
  const human = toTemplateData(report({ interpretation: ["사람이 다 고쳐 쓴 문단입니다."] })) as D;
  assert.match(human.insight.limitation!, /3곳을 함께 소개한 큐레이션입니다/);
  assert.equal(human.post.multi_store, true);
});

// ── 0930: 릴스 — 명사·조회의 뜻만 바꾸고 시청 시간 문단을 붙인다 ─────────────
const reel = (metrics: Record<string, number | null>, duration: number | null = 28, co = 1) => ({
  ...report().snapshot, store: { name: "통통", campus: null },
  post: { ...report().snapshot.post, format: "reel", co_stores: co },
  metrics: [],
  report_data: { ...rd, post: { ...rd.post!, format: "reel", duration_sec: duration }, metrics },
});
const REEL = { views: 12400, reach: 8100, shares: 96, saved: 140, likes: 310, comments: 12, avg_watch_ms: 16400, total_watch_ms: 203_280_000 };

test("릴스 글은 「릴스」로 말한다 · 시청 시간은 글에 쓰지 않는다(세부 지표에 있다)", () => {
  const out = ownerStory(reel(REEL));
  assert.deepEqual(out, [
    "이번 통통 큐레이션 릴스 성과를 분석해 전달드립니다.",
    "이번 릴스는 면 요리 맛집으로 알려진 대구 지역 맛집 여러 곳을 함께 큐레이션하는 방식으로 제작되었습니다. 이를 통해 통통이 대구의 대표적인 면 요리 맛집 중 하나로 자연스럽게 소개되었으며, 타깃 고객층에게 브랜드 인지도를 높이고 긍정적인 이미지를 형성하는 데 도움이 되었을 것으로 보입니다.",
    "해당 릴스는 총 12,400회의 조회수를 기록했습니다.",
    "또한 좋아요, 댓글, 저장, 공유 등 이용자의 실제 행동을 나타내는 총반응 수는 558건으로 집계되었습니다. 이는 단순한 노출을 넘어 콘텐츠에 대한 관심과 참여를 이끌어냈으며, 향후 통통 방문을 고려하게 하는 계기를 마련했다는 점에서 의미 있는 성과라고 볼 수 있습니다.",
  ]);
});

test("평균 시청 시간은 영상 길이의 절반 이상일 때만 — 모르면 10초 이상일 때만", () => {
  const short = reelWatchLine(reel({ ...REEL, avg_watch_ms: 6400 }, 28))!;
  assert.doesNotMatch(short, /평균 시청 시간/, "28초 릴스의 6.4초는 세우지 않는다");
  assert.match(short, /^모든 재생을 합친 총 시청 시간은/, "총 시청 시간은 남는다");
  assert.doesNotMatch(reelWatchLine(reel({ ...REEL, avg_watch_ms: 6400 }, null)) ?? "", /평균 시청 시간/, "길이를 모르면 10초 미만은 쓰지 않는다");
  const noDur = reelWatchLine(reel({ ...REEL, avg_watch_ms: 12300 }, null))!;
  assert.match(noDur, /평균 시청 시간은 12\.3초입니다/);
  assert.doesNotMatch(noDur, /길이 영상의 절반/, "길이를 모르면 길이 문장은 없다");
});

test("시청 시간이 없거나 1분 미만이면 문단이 없다 · 여러 가게 편은 「가게가 소개된 영상」", () => {
  assert.equal(reelWatchLine(reel({ ...REEL, avg_watch_ms: null, total_watch_ms: null })), null, "0930 이전 스냅샷");
  assert.equal(reelWatchLine(reel({ ...REEL, avg_watch_ms: 3000, total_watch_ms: 50_000 })), null);
  assert.match(reelWatchLine(reel(REEL, 28, 4))!, /이용자들이 그만큼의 시간 동안 통통이 소개된 영상을 보았습니다\./);
  assert.match(reelWatchLine(reel({ ...REEL, total_watch_ms: 25 * 60000 }))!, /총 시청 시간은 25분입니다/);
});

test("피드 글에는 시청 시간 문단이 없다", () => {
  assert.ok(!ownerStory(gift()).some((t) => t.includes("시청 시간")));
});

test("릴스 글도 승인 가드를 통과하고 편집 한도(한 줄 300자 · 6줄) 안에 든다", () => {
  const s = reel(REEL, 28, 4);
  const out = ownerStory(s);
  const r = checkText(out.join("\n"), s);
  assert.ok(r.ok, r.problems.join(", "));
  assert.ok(out.length <= 6, `${out.length}줄`);
  for (const t of out) assert.ok(t.length <= 300, `${t.length}자: ${t.slice(0, 30)}…`);
});

test("릴스 평균 시청 시간·영상 길이를 양식 데이터로 넘긴다", () => {
  const d = toTemplateData(report({}, reel(REEL))) as { post: { format: string; duration_sec: number | null }; metrics: { avg_watch_sec: number | null } };
  assert.equal(d.post.format, "reels");
  assert.equal(d.post.duration_sec, 28);
  assert.equal(d.metrics.avg_watch_sec, 16.4);
  assert.equal((toTemplateData(report()) as { metrics: { avg_watch_sec: number | null } }).metrics.avg_watch_sec, null, "피드는 null");
});

test("이미 만든 리포트의 자동 문장(9/25~9/28 짧은 문장)은 새 글로, 사람이 쓴 문장은 뒤에 남긴다", () => {
  const s = gift();
  const out = ownerParagraphs(["저장이 67번 모였습니다. 저장은 '나중에 가봐야지' 하고 담아두는 행동이라, …", "사장님 메뉴가 특히 반응이 좋았습니다."], s);
  assert.deepEqual(out, [...ownerStory(s), "사장님 메뉴가 특히 반응이 좋았습니다."]);
  assert.deepEqual(ownerParagraphs(["사람이 다 고쳐 쓴 문단입니다."], s), ["사람이 다 고쳐 쓴 문단입니다."], "자동 문장이 하나도 없으면 사람 것만");
  assert.deepEqual(ownerParagraphs(ownerStory(s), s), ownerStory(s));
});

test("「수치 다시 읽기」는 손대지 않은 자동 문장만 새 숫자로 다시 쓴다", () => {
  const old = gift();
  const next = { ...old, report_data: { ...rd, metrics: { views: 9000, reach: 4100, shares: 150, saved: 80, likes: 70, comments: 3 } } };
  const untouched = refreshText({ summary: ownerHeadline(old), interpretation: ownerStory(old), snapshot: old }, next);
  assert.deepEqual(untouched.interpretation, ownerStory(next));
  assert.equal(untouched.summary, ownerHeadline(next));
  const edited = refreshText({ summary: "사람이 쓴 요약", interpretation: ["사람이 다 고쳐 쓴 문단입니다."], snapshot: old }, next);
  assert.deepEqual(edited, {}, "사람이 고친 것은 건드리지 않는다");
});

// ── 1005: 한 줄 요약 — 도달 대신 조회수 · 총반응 수 (마케팅) ─────────────
test("한 줄 요약은 도달이 아니라 조회수와 총반응 수 — 첫 문단과 같은 이름으로 부른다", () => {
  const s = gift();
  assert.equal(ownerHeadline(s), "이번 기프트버거 큐레이션 콘텐츠는 조회수 6,674회, 총반응 수 241건을 기록했습니다.");
  assert.ok(!/도달|닿았/.test(ownerHeadline(s)));
  const guard = checkText(ownerHeadline(s), s);
  assert.ok(guard.ok, guard.problems.join(", "));
  const solo = { ...reel(REEL), post: { ...reel(REEL).post, topic: "통통 협찬" } };
  assert.equal(ownerHeadline(solo), "이번 통통 릴스는 조회수 12,400회, 총반응 수 558건을 기록했습니다.");
});

test("한 줄 요약 — 반응이 작으면 조회수만, 조회수가 작으면 기본 문장", () => {
  const few = { ...gift(), report_data: { ...rd, metrics: { views: 820, reach: 600, shares: 1, saved: 2, likes: 3, comments: 0 } } };
  assert.equal(ownerHeadline(few), "이번 기프트버거 큐레이션 콘텐츠는 조회수 820회를 기록했습니다.");
  const none = { ...gift(), report_data: { ...rd, metrics: { views: 4, reach: 3 } } };
  assert.equal(ownerHeadline(none), DEFAULT_SUMMARY);
});

test("이미 만든 리포트의 도달 요약(~1005)은 자동 요약으로 알아보고, 「수치 다시 읽기」에서 새 요약으로 바꾼다", () => {
  const s = gift();
  assert.equal(headlineBefore1005(s), "기프트버거 등 3곳을 소개한 이번 콘텐츠가 3,482명에게 닿았습니다.");
  assert.ok(isAutoSummary(headlineBefore1005(s), s));
  const out = refreshText({ summary: headlineBefore1005(s), interpretation: ownerStory(s), snapshot: s }, s);
  assert.equal(out.summary, ownerHeadline(s));
  assert.equal(refreshText({ summary: "사람이 쓴 요약", interpretation: ownerStory(s), snapshot: s }, s).summary, undefined, "사람이 쓴 요약은 그대로");
});

test("약점을 말하던 제안(P2·P4)은 더 생기지 않고, P1 은 평소·부족을 말하지 않는다", () => {
  const snap = (ms: ReturnType<typeof metric>[], app: StoreReport["snapshot"]["app"] = null) => ({ ...report().snapshot, metrics: ms, app });
  // P4 가 걸리던 조건: 도달·저장 모두 가운데 값의 80% 아래 · P2: 도달은 이상인데 프로필 방문이 적음
  const weak = propose(snap([metric("reach", 1000, 5000, 45), metric("saved", 20, 200, 45), metric("profile_visits", 5, 100, 45)]));
  assert.ok(!weak.some((p) => p.rule === "P2" || p.rule === "P4"));
  const strong = propose(snap([metric("saved", 600, 200, 45), metric("reach", 9000, 5000, 45), metric("profile_visits", 5, 100, 45)],
    { month: "2026-09", coupon_redeemed: 0, stamp_earned: 0, revisit: 0, loyal_total: 0 }));
  const p1 = strong.find((p) => p.rule === "P1");
  assert.ok(p1, "저장이 많고 쿠폰 사용이 없으면 QR 안내물 제안");
  assert.doesNotMatch(p1!.text, /평소|아직 없습니다/);
  assert.ok(!strong.some((p) => p.rule === "P2"));
});

test("제안 근거 줄에 채널 비교(가운데 값)를 쓰지 않고, 옛 리포트에 박힌 비교 조각은 화면에서 걷어낸다 (1005)", () => {
  const strong = propose({ ...report().snapshot, metrics: [metric("saved", 600, 200, 45), metric("shares", 400, 100, 45)],
    app: { month: "2026-09", coupon_redeemed: 0, stamp_earned: 0, revisit: 0, loyal_total: 0 } });
  assert.deepEqual(strong.map((p) => p.rule), ["P1", "P3"]);
  for (const p of strong) assert.doesNotMatch(`${p.signal} ${p.reading}`, /가운데|평소|n=/);
  assert.equal(strong[0].signal, "저장 600 / 이번 달 쿠폰 사용 0");
  assert.equal(strong[0].reading, "앱 쿠폰 사용 없음 (병렬 서술, 인과 아님)");
  // ~1005 에 저장된 근거 줄
  assert.equal(stripChannelCompare("저장 45 · 평소 가운데 값 약 240 / 이번 달 쿠폰 사용 0"), "저장 45 / 이번 달 쿠폰 사용 0");
  assert.equal(stripChannelCompare("저장 가운데 값의 1.2배 이상 (n=45) · 앱 쿠폰 사용 없음 (병렬 서술, 인과 아님)"), "앱 쿠폰 사용 없음 (병렬 서술, 인과 아님)");
  assert.equal(stripChannelCompare("공유 가운데 값의 1.3배 이상 (n=45)"), "");
  assert.equal(stripChannelCompare("공유 77 · 평소 가운데 값 52"), "공유 77");
  assert.equal(stripChannelCompare("스탬프는 쌓이는데 재방문 0"), "스탬프는 쌓이는데 재방문 0");
});

test("이미 만든 리포트의 옛 채널 비교 문장·약점 제안은 그릴 때 갈아 끼운다 — 사람이 고친 문장은 그대로", () => {
  const legacy = report({
    summary: "저장 644은(는) 우리 채널이 평소 올리는 게시물 45건의 가운데 값(약 240)보다 높습니다. 같은 형식으로 올린 45건 중 3번째입니다.",
    interpretation: [
      "저장 538은(는) 우리 채널이 평소 올리는 게시물 45건의 가운데 값(약 240)보다 높습니다.",
      "도달은(는) 비교 기준(우리 채널 평소 게시물 5건 이상)이 아직 없어 수치만 드립니다.",
      "사장님 메뉴 사진이 특히 반응이 좋았습니다.",
    ],
    proposals: [
      { rule: "P4", title: "촬영 재진행", generated_text: "이번 편은 평소보다 적게 나갔습니다.", text: "이번 편은 평소보다 적게 나갔습니다.", approved: true, edited_by: null, edited_at: null },
      { rule: "P1", title: "매장 안 QR 안내물", generated_text: "이번 게시물은 저장이 평소보다 많았습니다. 한편 이번 달 앱 쿠폰 사용은 아직 없습니다.", text: "이번 게시물은 저장이 평소보다 많았습니다. 한편 이번 달 앱 쿠폰 사용은 아직 없습니다.", approved: true, edited_by: null, edited_at: null },
      { rule: "P3", title: "모임·단체 소구", generated_text: "공유는 기계 문장", text: "사람이 고친 공유 제안입니다.", approved: true, edited_by: "아윤", edited_at: "" },
    ],
  });
  const d = toTemplateData(legacy) as { insight: { headline: string | null; paragraphs: string[]; limitation: string | null } };
  const all = [d.insight.headline ?? "", ...d.insight.paragraphs].join("\n");
  assert.doesNotMatch(all, /우리 채널|가운데 값|번째|평소|아직 없습니다/);
  assert.equal(d.insight.headline, null, "자동 요약은 카드 제목으로 쓰지 않는다(0928)");
  assert.ok(d.insight.paragraphs.includes("사장님 메뉴 사진이 특히 반응이 좋았습니다."), "사람이 쓴 줄은 남는다");
  assert.equal(d.insight.paragraphs[0], "이번 라라더 큐레이션 콘텐츠 성과를 분석해 전달드립니다.", "옛 줄 자리에 지금 규칙의 글");
  assert.ok(d.insight.paragraphs.some((t) => t.startsWith("또한 좋아요, 댓글, 저장, 공유 등 이용자의 실제 행동을 나타내는 총반응 수는")), "총반응 수(1003 글)");
  assert.ok(!d.insight.paragraphs.some((t) => t.includes("촬영 재진행")), "없앤 제안은 빠진다");
  assert.ok(d.insight.paragraphs.some((t) => t.includes("사람이 고친 공유 제안입니다.")), "고친 제안은 그대로");
  assert.ok(d.insight.paragraphs.some((t) => t.includes("대구 지역 맛집 여러 곳을 함께 큐레이션")), "큐레이션 소개");
  assert.equal(d.insight.limitation, null, "소개 문단이 이미 말했다 — 「N곳을 함께 소개한 큐레이션입니다」를 또 붙이지 않는다");
});

test("카톡용 텍스트에 채널 비교·순위·작은 숫자가 없다", () => {
  const s = { ...report().snapshot, metrics: [withBaskets({ key: "saved", value: 538 }, { recent5: basket(2, 5), recent10: basket(3, 10), all: basket(12, 48) }), metric("views", 20000), metric("reach", 15503), metric("comments", 2)],
    app: { month: "2026-09", coupon_redeemed: 0, stamp_earned: 4, revisit: 0, loyal_total: 0 } };
  const t = buildReportText(s, "D7");
  assert.doesNotMatch(t, CHANNEL);
  assert.doesNotMatch(t, /댓글 2/, "10 미만은 싣지 않는다");
  assert.doesNotMatch(t, /쿠폰 0장/, "앱도 0 은 싣지 않는다");
  assert.match(t, /스탬프 4개가 적립됐습니다\./);
  assert.match(t, /해당 콘텐츠는 총 20,000회의 조회수를 기록했습니다\./, "공개 리포트와 같은 글");
  assert.doesNotMatch(t, /성과를 (정리|분석)해 전달드립니다/, "첫 문장은 인사 줄이 대신한다");
  assert.match(t, /'대구 면 요리 맛집' 게시물에 라라더를 소개해/, "내부 표시 「(… 포함)」을 떼고 조사를 맞춘다");
});

test("양식이 「지난 보고 이후」 표와 「게시물 전체의 숫자」 문장을 그리지 않는다 (0925 마케팅 결정)", () => {
  // 0925 에 뺀 것은 **지난 보고와 견주는 표**다. 그 자리(r-change)는 0927 부터
  // 「시간이 지나며 쌓인 숫자」(1일·7일·14일)가 쓴다 — 그건 남과 견주는 게 아니라
  // 자기 게시물이 쌓인 과정이라 방향에 어긋나지 않는다.
  // 그래서 자리가 비었는지가 아니라 **그 표가 없는지**를 본다.
  // 주석이 아니라 **그려지는 문자열**로 본다. 양식 머리말 주석에는 "지난 보고 이후" 라는
  // 말이 원래부터 (뺐다는 기록으로) 들어 있어서, 그 말의 유무로는 판정할 수 없다.
  assert.ok(!REPORT_TEMPLATE_HTML.includes("<th>지표"), "지표 대비 표는 되살아나면 안 된다");
  assert.ok(!REPORT_TEMPLATE_HTML.includes("지난 보고 이후 도달"), "그 카드의 해석 문장도 되살아나면 안 된다");
  assert.ok(REPORT_TEMPLATE_HTML.includes('<div id="r-change"></div>'), "PNG 나누기가 참조하는 자리는 그대로");
  assert.ok(!REPORT_TEMPLATE_HTML.includes("게시물 전체의 숫자입니다"));
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

test("PNG 는 카톡용으로 두 장을 낸다 (1002 — 세 장에서 줄였다)", () => {
  const bar = downloadBar({ filename: "x", canDownload: true, statusLabel: "승인됨" });
  assert.match(bar, /PNG 저장 \(2장\)/);
  const pages = bar.match(/var PAGES = \[([\s\S]*?)\n  \];/)!;
  assert.equal([...pages[1].matchAll(/\{ no: \d/g)].length, 2);
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
test("양식의 모든 구획이 PNG 장 어딘가에 들어가거나, 일부러 뺀 목록(PNG_SKIP)에 있다", () => {
  const inTemplate = new Set(
    [...REPORT_TEMPLATE_HTML.matchAll(/id="(r-[a-z]+)"/g)].map((m) => m[1])
  );
  inTemplate.delete("r-errors"); // 발송 전 검사용 — 리포트 내용이 아니다

  const bar = downloadBar({ filename: "x", canDownload: true, statusLabel: "승인됨" });
  const pages = bar.match(/var PAGES = \[([\s\S]*?)\n  \];/);
  assert.ok(pages, "PAGES 를 못 찾았습니다");
  const skip = bar.match(/var PNG_SKIP = \[([^\]]*)\]/);
  assert.ok(skip, "PNG_SKIP 을 못 찾았습니다");
  const covered = new Set([...(pages[1] + skip[1]).matchAll(/"(r-[a-z]+)"/g)].map((m) => m[1]));

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

test("사진을 다시 압축해서 넘긴다 — PNG·HTML·스냅샷이 같이 가벼워진다", () => {
  const bar = downloadBar({ filename: "x", canDownload: true, statusLabel: "승인됨" });
  assert.match(bar, /function shrunkDataUrl\(url, maxW\)/);
  assert.match(bar, /toDataURL\("image\/jpeg", 0\.85\)/);
  assert.match(bar, /shrunkDataUrl\(was, 1400\)/, "PNG 로 넘길 때");
  assert.match(bar, /shrunkDataUrl\(i\.src, 1400\)/, "HTML 저장할 때");
  // 작은 png 을 jpeg 로 바꾸면 되레 커질 수 있다 — 그때는 원본을 쓴다
  assert.match(bar, /out\.length < u\.length \? out : u/);
});

// ── 시간이 지나며 쌓인 숫자 (1일 · 7일 · 14일) ────────────────────────
import * as vm2 from "node:vm";

/** 양식의 렌더러를 최소 DOM 에서 돌려 각 자리(r-…)에 무엇이 들어갔는지 읽는다. */
function renderNodes(html: string): Record<string, { textContent?: string; innerHTML: string }> {
  const json = /<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(json, "report-data 블록을 못 찾았습니다");
  const scripts = [...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)];
  assert.ok(scripts.length, "렌더러 스크립트를 못 찾았습니다");
  const nodes: Record<string, { textContent?: string; innerHTML: string }> = {};
  for (const id of ["report-data", "r-head", "r-post", "r-key", "r-metrics", "r-app", "r-change", "r-compare", "r-insight", "r-upsell", "r-foot", "r-errors"]) {
    nodes[id] = { innerHTML: "" };
  }
  nodes["report-data"].textContent = json[1];
  // 양식은 body.setAttribute("data-report-status", ...) 만 쓴다 — 그것만 흉내 낸다.
  const attrs: Record<string, string> = {};
  const body = { setAttribute: (k: string, v: string) => { attrs[k] = v; } };
  const ctx: Record<string, unknown> = {
    document: { getElementById: (id: string) => nodes[id] ?? null, body },
    console,
  };
  vm2.createContext(ctx);
  new vm2.Script(scripts[scripts.length - 1][1]).runInContext(ctx);
  return nodes;
}
const renderChange = (html: string) => renderNodes(html)["r-change"].innerHTML;

const withSeries = (series: ({ day: number; measured_at: string } & Partial<Record<"reach" | "views" | "total_interactions" | "likes" | "saved" | "shares" | "comments", number>>)[]) =>
  fillReportTemplate(report({}, { report_data: { ...rd, series } }));

test("시계열이 두 점 이상이면 막대를 그리고, 마지막 점을 진하게 한다", () => {
  const html = withSeries([
    { day: 1, measured_at: "2026-09-05", views: 1200, total_interactions: 180 },
    { day: 7, measured_at: "2026-09-11", views: 3000, total_interactions: 450 },
    { day: 14, measured_at: "2026-09-18", views: 3800, total_interactions: 600 },
  ]);
  const out = renderChange(html);
  assert.match(out, /시간이 지나며 쌓인 숫자/);
  assert.match(out, /조회수 \(회\)/);
  assert.match(out, /반응 수 \(회\)/);
  // 진한 막대(.me)는 마지막 점 하나뿐이어야 한다 — 기준일이 둘이면 어느 게 지금인지 모른다
  assert.equal((out.match(/class="row me"/g) ?? []).length, 2, "두 지표 각각의 마지막 줄만");
  // 마지막 줄이 14일인가
  const rows = [...out.matchAll(/class="row( me)?"><div class="lb">(\d+)일/g)].map((m) => [m[2], !!m[1]]);
  assert.deepEqual(rows, [["1", false], ["7", false], ["14", true], ["1", false], ["7", false], ["14", true]]);
  assert.match(out, /게시 후 1일 <b>1,200회<\/b>에서 14일 <b>3,800회<\/b>가 되었습니다/);
  assert.match(out, /진한 막대가 14일 기준값입니다/);
});

test("점이 하나면 그리지 않는다 — 한 점은 추이가 아니다", () => {
  const out = renderChange(withSeries([{ day: 7, measured_at: "2026-09-11", views: 3000, total_interactions: 450 }]));
  assert.equal(out, "", "위 카드가 이미 말하는 값을 두 번 쓰지 않는다");
});

test("series 가 없으면 그 자리는 빈다 — 0 으로 채우지 않는다", () => {
  const out = renderChange(fillReportTemplate(report({}, { report_data: rd })));
  assert.equal(out, "");
});

test("빠진 점은 건너뛰고 있는 점만 그린다", () => {
  // D+1 을 놓친 옛 게시물 — 7일·14일 두 점으로 그린다
  const out = renderChange(withSeries([
    { day: 7, measured_at: "2026-09-11", views: 3000, total_interactions: 450 },
    { day: 14, measured_at: "2026-09-18", views: 3800, total_interactions: 600 },
  ]));
  assert.match(out, /시간이 지나며 쌓인 숫자/);
  const days = [...out.matchAll(/class="lb">(\d+)일/g)].map((m) => m[1]);
  assert.deepEqual(days, ["7", "14", "7", "14"], "1일 칸을 0 으로 만들지 않는다");
  assert.match(out, /게시 후 7일 <b>3,000회<\/b>에서 14일 <b>3,800회<\/b>/);
});

test("한 점에서 한 지표만 빠지면 그 칸은 0 이 아니라 「–」", () => {
  // 7일엔 조회수가 없고 반응 수만 있는 경우. 0 으로 채우면 "1,200 → 0 → 3,800" 으로
  // 중간에 폭락한 것처럼 읽힌다. 모르는 값은 모른다고 적는다.
  const out = renderChange(withSeries([
    { day: 1, measured_at: "2026-09-05", views: 1200, total_interactions: 180 },
    { day: 7, measured_at: "2026-09-11", total_interactions: 450 },
    { day: 14, measured_at: "2026-09-18", views: 3800, total_interactions: 600 },
  ]));
  const viewBlock = out.slice(out.indexOf("조회수 (회)"), out.indexOf("반응 수 (회)"));
  assert.match(viewBlock, /<div class="nm">\u2013<\/div>/, "빠진 값은 – 로");
  assert.doesNotMatch(viewBlock, /<div class="nm">0<\/div>/, "0 으로 채우면 폭락으로 읽힌다");
  assert.match(viewBlock, /width:0%/, "막대도 그리지 않는다");
});

test("한 지표만 있으면 그 지표만 그린다", () => {
  const out = renderChange(withSeries([
    { day: 7, measured_at: "2026-09-11", views: 3000 },
    { day: 14, measured_at: "2026-09-18", views: 3800 },
  ]));
  assert.match(out, /조회수 \(회\)/);
  assert.doesNotMatch(out, /반응 수 \(회\)/, "값이 없는 지표 칸은 만들지 않는다");
});

test("추이 막대는 조회수 · 반응 수 — total_interactions 가 없으면 넷을 더하고, 본 사람 수(도달)는 그리지 않는다 (1002)", () => {
  const out = renderChange(withSeries([
    { day: 7, measured_at: "2026-09-11", reach: 3000, views: 4500, likes: 100, saved: 20, shares: 30, comments: 5 },
    { day: 14, measured_at: "2026-09-18", reach: 3800, views: 6000, total_interactions: 241 },
  ]));
  assert.match(out, /조회수 \(회\)[\s\S]*반응 수 \(회\)/, "조회수가 먼저, 반응 수가 다음");
  assert.doesNotMatch(out, /조회한 사람|3,000|3,800|명<\/b>/, "도달은 추이에 없다");
  assert.match(out, /조회수는 게시 후 7일 <b>4,500회<\/b>에서 14일 <b>6,000회<\/b>가 되었습니다\./);
  const react = out.slice(out.indexOf("반응 수 (회)"));
  assert.match(react, /<div class="nm">155<\/div>/, "100+20+30+5");
  assert.match(react, /<div class="nm">241<\/div>/);
});

test("시계열은 PNG 2쪽에 들어간다 — 자리가 빠지면 사장님이 못 본다 · 세부 지표는 PNG 에 안 들어간다", () => {
  const bar = downloadBar({ filename: "r", canDownload: true, statusLabel: "승인됨" });
  assert.match(bar, /\{ no: 2, ids: \["r-key", "r-insight", "r-change"/, "2쪽 = 게시물 성과 + 설명 + 추이");
  assert.match(bar, /\{ no: 1, ids: \["r-head", "r-post"\] \}/, "1쪽 = 게시물(사진·썸네일)");
  assert.match(bar, /var PNG_SKIP = \["r-metrics"\]/);
});

// ── 0928: 「프로필 방문 · 팔로우」 줄을 사장님 화면에서 뺀다 ─────────────
test("성과 카드·세부 지표에 프로필 방문·팔로우가 없다 — 값이 와도", () => {
  const html = fillReportTemplate(report({}, { report_data: { ...rd, metrics: { ...rd.metrics, profile_visits: 165, follows: 27 } } }));
  const nodes = renderNodes(html);
  assert.match(nodes["r-key"].innerHTML, /게시물 성과/, "카드 자체는 그대로 그린다");
  assert.match(nodes["r-key"].innerHTML, /조회수/);
  assert.doesNotMatch(nodes["r-key"].innerHTML + nodes["r-metrics"].innerHTML, /프로필 방문|팔로우/);
});

// ── 1002: 핵심 숫자 두 개(조회수 강조 · 반응 수) + 세부 지표는 접어서 ─────────────
test("핵심 숫자 카드 — 조회수(강조)와 반응 수(좋아요·저장·공유·댓글 합)", () => {
  const out = renderNodes(fillReportTemplate(report({}, { report_data: rd })))["r-key"].innerHTML;
  assert.match(out, /<div class="key hl"><div class="k">조회수<\/div><div class="v">32,657<small>회<\/small>/);
  assert.match(out, /<div class="key"><div class="k">반응 수<\/div><div class="v">1,432<small>회<\/small>/, "644+528+258+2");
  assert.match(out, /좋아요 · 저장 · 공유 · 댓글을 합친 수/);
});

test("핵심 숫자 카드는 팔로워·본 사람 수를 말하지 않는다 (1002 결정)", () => {
  const out = renderNodes(fillReportTemplate(report({}, { report_data: rd })))["r-key"].innerHTML;
  assert.doesNotMatch(out, /팔로워|본 사람/);
});

test("세부 지표는 접혀 있고(「세부 지표 보기」) 조회수는 거기 다시 안 나온다 · 강조 없음", () => {
  const out = renderNodes(fillReportTemplate(report({}, { report_data: rd })))["r-metrics"].innerHTML;
  assert.match(out, /^<details class="more"><summary>세부 지표 보기<\/summary>/);
  assert.doesNotMatch(out, /<details[^>]* open/);
  for (const k of ["도달", "저장", "공유", "좋아요", "댓글"]) assert.match(out, new RegExp(`<div class="k">${k}`));
  assert.doesNotMatch(out, /조회수|kv hl/);
});

// ── 한 장 만들기 — 점주 링크 · 담당자 미리보기 · PROBE 크론이 같은 함수를 쓴다 (0928) ──────────
const TOKEN = "a".repeat(40);
test("미리보기(담당자·PROBE 크론)는 파일 받기 띠가 붙고, 점주 링크에는 없다", () => {
  const r = report({}, { report_data: rd });
  const preview = reportPageHtml(r, { origin: "https://app.example", preview: true });
  assert.match(preview, /data-preview-bar/);
  assert.match(preview, /window\.__reportFiles/, "러너가 부를 파일 생성 함수가 있어야 한다");
  assert.match(preview, /승인됨/);
  assert.ok(preview.includes(JSON.stringify(reportFilename(r))), "띠의 파일 이름과 PROBE 가 올리는 파일 이름이 같아야 한다");
  const owner = reportPageHtml({ ...r, token: TOKEN }, { origin: "https://app.example", preview: false, beaconToken: TOKEN });
  assert.doesNotMatch(owner, /data-preview-bar/);
  assert.match(owner, /og:title/);
});

test("승인 전 리포트의 미리보기는 파일 받기가 잠겨 있다", () => {
  const html = reportPageHtml(report({ status: "DRAFT" }), { origin: "https://app.example", preview: true });
  assert.match(html, /승인 전/);
  assert.match(html, /CAN = false/);
  assert.deepEqual(DOWNLOADABLE, ["APPROVED", "LINKED", "SENT"]);
});

test("파일 이름 — 매장_성과리포트_며칠차_측정일", () => {
  assert.equal(reportFilename(report({}, { report_data: rd })), "라라더_성과리포트_14일차_20260918");
});

test("PNG 의 「못 불러온 이미지」 자리는 올바른 GIF 다 — 잘린 GIF 면 이미지 하나 때문에 PNG 전체가 죽는다(1001)", () => {
  const bytes = Buffer.from(PLACEHOLDER_GIF.split(",")[1], "base64");
  assert.equal(bytes.subarray(0, 6).toString("latin1"), "GIF89a");
  assert.equal(bytes[bytes.length - 1], 0x3b, "GIF 끝 표시(;)가 없으면 브라우저가 디코드하지 못한다");
  assert.ok(bytes.includes(0x2c), "이미지 구획(,)이 있어야 한다");
  const bar = downloadBar({ filename: "f", canDownload: true, statusLabel: "승인됨" });
  assert.ok(bar.includes(JSON.stringify(PLACEHOLDER_GIF)), "페이지 스크립트가 같은 값을 쓴다");
  assert.ok(!bar.includes("R0lGODlhAQABAAAAACw="), "잘린 옛 값이 남아 있으면 안 된다");
});

test("슬랙에 붙일 인스타 게시물 주소 — 리포트 화면과 같은 우선순위, http(s) 만", () => {
  assert.equal(reportPermalink(report()), "https://ig/p/x", "스냅샷의 주소");
  const rd2: ReportData = { ...rd, post: { ...rd.post!, permalink: "https://www.instagram.com/reel/NEW/" } as ReportData["post"] };
  assert.equal(reportPermalink(report({}, { report_data: rd2 })), "https://www.instagram.com/reel/NEW/", "수치를 다시 읽었으면 그 주소");
  assert.equal(reportPermalink(report({}, { post: { ...report().snapshot.post, permalink: "" } })), null);
  assert.equal(reportPermalink(report({}, { post: { ...report().snapshot.post, permalink: "javascript:alert(1)" } })), null, "슬랙 링크로 쓰므로 http(s) 가 아니면 버린다");
});

test("편집 화면 카드는 해석 글과 같은 날의 숫자 — 14일차면 7일차 숫자도 작은 줄로 (1005)", () => {
  // 카드가 Papillon 성과(D+7)를, 글이 report-data(D+14)를 읽어 한 화면에 조회수가 둘 떴다
  const s = report({}, { report_data: rd }).snapshot;
  const views = s.metrics.find((m) => m.key === "views")!;
  assert.equal(cardValue(s, views), 32657, "스냅샷 지표(D+7 20000)가 아니라 report-data 의 D+14");
  assert.equal(cardValue(s, views), ownerNumbers(s).views, "해석 글이 쓰는 숫자와 같다");
  assert.equal(day7Line(s, views), "7일차 20,000", "7일차 숫자를 작은 줄로 같이");
  assert.deepEqual(measuredPoint(s), { day: 14, date: "2026-09-18" });

  // report-data 도 7일차면 카드가 곧 7일차라 작은 줄이 없다
  const s7 = report({}, { report_data: { ...rd, day: 7, window: "D7", measured_at: "2026-09-11" } }).snapshot;
  assert.equal(day7Line(s7, s7.metrics[0]), null);

  // report-data 가 없는 옛 스냅샷은 스냅샷 지표 그대로
  const old = report().snapshot;
  assert.equal(cardValue(old, old.metrics.find((m) => m.key === "views")!), 20000);
  assert.equal(day7Line(old, old.metrics[0]), null);
  assert.deepEqual(measuredPoint(old), { day: 7, date: "2026-09-11" });
});

test("1009 — Probe 성과 지표가 14일차(basis D14)면 7일차 작은 줄은 report-data 추이에서 읽는다", () => {
  const series = [{ day: 1, measured_at: "2026-09-05", views: 3000 }, { day: 7, measured_at: "2026-09-11", views: 20000 }, { day: 14, measured_at: "2026-09-18", views: 32657 }];
  const s = report({}, { basis: "D14", metrics: [metric("views", 32657), metric("reach", 18702)], report_data: { ...rd, series } }).snapshot;
  assert.equal(day7Line(s, s.metrics[0]), "7일차 20,000", "스냅샷 metrics(14일차 32,657)가 아니라 추이의 7일차");
  assert.equal(day7Line(s, s.metrics[1]), null, "추이에 7일차 도달이 없으면 줄이 없다 — 14일차 값을 7일차라고 쓰지 않는다");

  // report-data 가 없으면 basis 가 며칠차를 말한다
  const bare = report({}, { basis: "D14", report_data: undefined }).snapshot;
  assert.deepEqual(measuredPoint(bare), { day: 14, date: "2026-09-18" });
});
