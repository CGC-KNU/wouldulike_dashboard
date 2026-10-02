import { test } from "node:test";
import assert from "node:assert/strict";
import { campusTarget, checkText, curationIntro, nonFollowerParagraph, ownerParagraphs, ownerStory, slideParagraph, soloIntro, watchParagraph } from "../src/lib/draft/report";
import { parseManual, slideTop } from "../src/lib/draft/reportManual";
import type { ReportData, ReportManual, ReportSnapshot } from "../src/lib/draft/types";

/**
 * 1003 — 마케팅이 준 해석 글. 대괄호 자리를 채우면 **그 글과 글자까지 같아야** 한다.
 * 그리고 글 속의 세 구절(꾸준한 증가세 · 대학가 핵심 타깃층 · 가장 높은 비중)은 근거가 있을 때만 붙는다.
 */

/** 마케팅 원문 — 대괄호를 채운 모습 (조회 6,904 · 18~34세 83.6% · 가게 장 38.8% · 7곳 · 총반응 253) */
const MARKETING_TEXT = `이번 기프트버거 큐레이션 콘텐츠 성과를 분석해 전달드립니다.
이번 콘텐츠는 수제버거 맛집으로 알려진 대구 지역 맛집 7곳을 함께 큐레이션하는 방식으로 제작되었습니다. 이를 통해 기프트버거가 대구의 대표적인 수제버거 맛집 중 하나로 자연스럽게 소개되었으며, 타깃 고객층에게 브랜드 인지도를 높이고 긍정적인 이미지를 형성하는 데 도움이 되었을 것으로 보입니다.
해당 콘텐츠는 총 6,904회의 조회수를 기록했으며, 현재까지도 꾸준한 증가세를 보이고 있습니다. 또한 도달한 이용자의 83.6%가 18~34세로, 대학가를 중심으로 한 기프트버거의 핵심 타깃층과 높은 연관성을 보였습니다.
슬라이드별 반응을 살펴보면, 썸네일을 제외했을 때 전체 좋아요 수의 38.8%가 기프트버거 슬라이드에서 발생했습니다. 이는 함께 소개된 7개 매장 중 가장 높은 비중으로, 콘텐츠를 본 이용자들의 관심과 호응이 기프트버거에 집중되었다는 점을 보여줍니다.
또한 좋아요, 댓글, 저장, 공유 등 이용자의 실제 행동을 나타내는 총반응 수는 253건으로 집계되었습니다. 이는 단순한 노출을 넘어 콘텐츠에 대한 관심과 참여를 이끌어냈으며, 향후 기프트버거 방문을 고려하게 하는 계기를 마련했다는 점에서 의미 있는 성과라고 볼 수 있습니다.`;

// 좋아요 80 = 썸네일 장 13 + 나머지 67, 그중 가게 장 26 → 26 ÷ 67 = 38.8%. 80 + 공유 105 + 저장 60 + 댓글 8 = 253.
const METRICS = { views: 6904, reach: 3600, likes: 80, shares: 105, saved: 60, comments: 8, total_interactions: 253 };
const GROWING = [
  { day: 1, measured_at: "2026-09-16", views: 3105 }, { day: 7, measured_at: "2026-09-22", views: 5830 }, { day: 14, measured_at: "2026-09-29", views: 6904 },
];
const FULL: ReportManual = { slide_likes: { thumb: 13, store: 26, top: true }, age: { p18_24: 51.2, p25_34: 32.4 }, store_count: 7 };

function snap(over: { manual?: ReportManual | null; series?: ReportData["series"]; topic?: string; format?: string; store?: ReportSnapshot["store"]; metrics?: Record<string, number> } = {}): ReportSnapshot {
  const format = over.format ?? "carousel";
  return {
    store: over.store ?? { name: "기프트버거", campus: null, in_app: true },
    post: { plan_id: 61, topic: over.topic ?? "대구 수제버거 맛집 (기프트버거 포함)", posted_at: "2026-09-15T18:00:00+09:00", permalink: "https://www.instagram.com/p/x/", format, caption: null, cover_url: null, owner_name: null, co_stores: 1 },
    as_of: "2026-09-29T03:00:00Z", basis: "D7", age_days: 14, collecting: false, metrics: [], cohort_note: null, app: null,
    report_data: {
      available: true, day: 14, window: "D14", measured_at: "2026-09-29",
      post: { posted_at: "2026-09-15", permalink: "https://www.instagram.com/p/x/", format, thumb_url: "", caption: "", card_count: 9 },
      metrics: over.metrics ?? METRICS, series: over.series === undefined ? GROWING : over.series,
    },
    manual: over.manual === undefined ? FULL : over.manual,
  };
}

test("대괄호를 채우면 마케팅이 준 글과 글자까지 같다", () => {
  assert.equal(ownerStory(snap()).join("\n"), MARKETING_TEXT);
});

test("그 글의 숫자는 승인 가드를 통과한다", () => {
  const s = snap();
  const r = checkText(ownerStory(s).join("\n"), s);
  assert.ok(r.ok, r.problems.join(", "));
});

// ── 근거가 있을 때만 붙는 구절 ①: 꾸준한 증가세 ─────────────
test("「꾸준한 증가세」는 추이의 마지막 구간에서 조회수가 늘었을 때만", () => {
  const views = (s: ReportSnapshot) => ownerStory(s)[2];
  assert.match(views(snap()), /기록했으며, 현재까지도 꾸준한 증가세를 보이고 있습니다\./);
  const flat = [{ day: 7, measured_at: "2026-09-22", views: 6904 }, { day: 14, measured_at: "2026-09-29", views: 6904 }];
  assert.match(views(snap({ series: flat })), /^해당 콘텐츠는 총 6,904회의 조회수를 기록했습니다\. 또한/);
  assert.doesNotMatch(views(snap({ series: flat })), /증가세/);
  assert.doesNotMatch(views(snap({ series: [] })), /증가세/, "추이가 없으면 늘고 있는지 모른다");
  assert.doesNotMatch(views(snap({ series: [{ day: 14, measured_at: "2026-09-29", views: 6904 }] })), /증가세/, "점 하나로는 모른다");
});

// ── ②: 대학가 핵심 타깃층 ─────────────
test("「대학가를 중심으로 한 … 핵심 타깃층」은 대학가 매장일 때만 — 앱 제휴 매장이 기본, 편집 화면에서 끌 수 있다", () => {
  const age = (s: ReportSnapshot) => ownerStory(s)[2];
  assert.match(age(snap()), /대학가를 중심으로 한 기프트버거의 핵심 타깃층과 높은 연관성을 보였습니다\.$/);
  // 앱에 없는 협찬 매장(교동) — 기본이 대학가 문구가 아니다
  const gyodong = snap({ store: { name: "교동서서", campus: null, in_app: false }, topic: "교동 서서 협찬", format: "reel", manual: { age: FULL.age } });
  assert.equal(campusTarget(gyodong), false);
  assert.ok(ownerStory(gyodong).some((t) => /또한 도달한 이용자의 83\.6%가 18~34세로, 젊은 고객층을 중심으로 노출되었습니다\.$/.test(t)));
  // 라라더처럼 대학가와 엮이기 싫어하는 제휴 매장 — 편집 화면에서 끈다
  assert.doesNotMatch(age(snap({ manual: { ...FULL, campus_target: false } })), /대학가/);
  // 반대로 협찬 매장도 켤 수 있다
  assert.equal(campusTarget({ ...gyodong, manual: { campus_target: true } }), true);
  // 옛 스냅샷(in_app 없음)은 이름의 대학 지점 표시로
  assert.equal(campusTarget(snap({ store: { name: "닭동가리 경북대점", campus: null } })), true);
  assert.equal(campusTarget(snap({ store: { name: "정든밤", campus: null }, manual: null })), false);
});

test("연령을 안 넣으면 그 문장은 없다 — 조회수 문장만", () => {
  assert.equal(ownerStory(snap({ manual: null, series: [] }))[2], "해당 콘텐츠는 총 6,904회의 조회수를 기록했습니다.");
});

// ── ③: 가장 높은 비중 ─────────────
test("「가장 높은 비중」은 1위가 확인됐을 때만 — 체크했거나, 남은 좋아요를 다 합쳐도 못 넘을 때", () => {
  const notTop: ReportManual = { ...FULL, slide_likes: { thumb: 13, store: 26 } };
  assert.equal(slideTop(notTop, 80), false, "26 vs 남은 41 — 한 가게가 다 받았으면 진다");
  assert.equal(slideParagraph(snap({ manual: notTop })),
    "슬라이드별 반응을 살펴보면, 썸네일을 제외했을 때 전체 좋아요 수의 38.8%가 기프트버거 슬라이드에서 발생했습니다. 이는 함께 소개된 7개 매장이 고르게 나눠 가졌을 때보다 높은 비중으로, 콘텐츠를 본 이용자들의 관심과 호응이 기프트버거에 모였다는 점을 보여줍니다.");
  assert.equal(slideTop({ slide_likes: { thumb: 13, store: 40 } }, 80), true, "40 vs 남은 27 — 확인 없이도 1위다");
  assert.match(slideParagraph(snap({ manual: { ...FULL, slide_likes: { thumb: 13, store: 40 } } }))!, /7개 매장 중 가장 높은 비중으로/);
});

test("가게 수로 고르게 나눈 것보다 낮으면 슬라이드 문단을 넣지 않는다 — 약점을 세우지 않는다", () => {
  const low: ReportManual = { ...FULL, slide_likes: { thumb: 13, store: 8 } }; // 8 ÷ 67 = 11.9% < 1/7
  assert.equal(slideParagraph(snap({ manual: low })), null);
  assert.ok(!ownerStory(snap({ manual: low })).some((t) => t.includes("슬라이드")));
});

test("가게 수를 모르면 「N개 매장」을 쓰지 않는다 — 1위가 아니면 비중만", () => {
  const noCount: ReportManual = { slide_likes: { thumb: 13, store: 26 } };
  assert.equal(slideParagraph(snap({ manual: noCount })), "슬라이드별 반응을 살펴보면, 썸네일을 제외했을 때 전체 좋아요 수의 38.8%가 기프트버거 슬라이드에서 발생했습니다.");
  assert.match(slideParagraph(snap({ manual: { slide_likes: { thumb: 13, store: 26, top: true } } }))!, /이는 함께 소개된 매장 중 가장 높은 비중으로/);
});

test("1위 체크는 값으로 저장된다", () => {
  const ctx = { likes: 80, carousel: true, curation: true, cards: 9 };
  assert.deepEqual(parseManual({ slide_likes: { thumb: 13, store: 26, top: true } }, ctx).manual, { slide_likes: { thumb: 13, store: 26, top: true } });
  assert.deepEqual(parseManual({ slide_likes: { thumb: 13, store: 26, top: false } }, ctx).manual, { slide_likes: { thumb: 13, store: 26 } });
  assert.deepEqual(parseManual({ campus_target: false }, ctx).manual, { campus_target: false });
});

// ── 큐레이션 소개의 대괄호 ─────────────
test("제목이 「지역 주제 맛집」 꼴이 아니면 억지로 끼워 넣지 않는다", () => {
  const odd = snap({ topic: "다이어터를 위한 맛집 추천 (스톡홀름샐러드 경대정문점 포함)", store: { name: "스톡홀름샐러드 경대정문점", campus: null, in_app: true } });
  assert.equal(curationIntro(odd),
    "이번 콘텐츠는 「다이어터를 위한 맛집 추천」을 주제로 7곳을 함께 큐레이션하는 방식으로 제작되었습니다. 이를 통해 스톡홀름샐러드 경대정문점이 추천 가게 중 하나로 자연스럽게 소개되었으며, 타깃 고객층에게 브랜드 인지도를 높이고 긍정적인 이미지를 형성하는 데 도움이 되었을 것으로 보입니다.");
  const bar = snap({ topic: "대구 감성 술집 (정든밤 포함)", store: { name: "정든밤", campus: null, in_app: true }, manual: null });
  assert.match(curationIntro(bar)!, /^이번 콘텐츠는 감성 술집으로 알려진 대구 지역 술집 여러 곳을 함께 큐레이션.*정든밤이 대구의 대표적인 감성 술집 중 하나로/);
});

test("큐레이션이 아니면(협찬 단독) 「큐레이션」을 말하지 않는다 · 릴스는 「릴스」", () => {
  const solo = ownerStory(snap({ topic: "교동후추 협찬", format: "reel", store: { name: "교동후추", campus: null, in_app: false }, manual: null }));
  assert.equal(solo[0], "이번 교동후추 릴스 성과를 분석해 전달드립니다.");
  assert.match(solo[1], /^이번 릴스는 교동후추 한 곳만을 단독으로 담은 영상으로 제작되었습니다\./, "단독 소개 서두(1003)");
  assert.match(solo[2], /^해당 릴스는 총 6,904회의 조회수를 기록했으며/);
  assert.doesNotMatch(solo.join(" "), /큐레이션|슬라이드/);
});

test("편집 화면 한도(한 줄 300자) 안에 든다", () => {
  for (const t of ownerStory(snap({ store: { name: "아주아주긴가게이름수제버거본점", campus: null, in_app: true }, topic: "대구 경북대 북문 수제버거 브런치 맛집 (아주아주긴가게이름수제버거본점 포함)" })))
    assert.ok(t.length <= 300, `${t.length}자: ${t.slice(0, 30)}…`);
});

// ── 1003 릴스 보강: 단독 소개 서두 · 총 시청 시간 · 팔로워가 아닌 사람 비율 ─────────────
const soloReel = (manual: ReportManual | null, metrics: Record<string, number> = { ...METRICS, total_watch_ms: 2_532_000 }) =>
  snap({ topic: "교동 서서 협찬", format: "reel", store: { name: "교동서서", campus: null, in_app: false }, manual, metrics });

test("단독 릴스 글: 인사 → 단독 소개 → 조회수 → 팔로워 아님 → 총반응 수", () => {
  assert.deepEqual(ownerStory(soloReel({ non_follower_pct: 76.4 })), [
    "이번 교동서서 릴스 성과를 분석해 전달드립니다.",
    "이번 릴스는 교동서서 한 곳만을 단독으로 담은 영상으로 제작되었습니다. 영상 전체가 교동서서에 집중되어 있어, 이를 본 이용자들에게 교동서서를 또렷하게 알리고 긍정적인 이미지를 형성하는 데 도움이 되었을 것으로 보입니다.",
    "해당 릴스는 총 6,904회의 조회수를 기록했으며, 현재까지도 꾸준한 증가세를 보이고 있습니다.",
    "조회의 76.4%는 우주라이크를 팔로우하지 않는 이용자에게서 나왔습니다. 기존 팔로워를 넘어 새로운 고객에게 교동서서를 알렸다는 뜻입니다.",
    "또한 좋아요, 댓글, 저장, 공유 등 이용자의 실제 행동을 나타내는 총반응 수는 253건으로 집계되었습니다. 이는 단순한 노출을 넘어 콘텐츠에 대한 관심과 참여를 이끌어냈으며, 향후 교동서서 방문을 고려하게 하는 계기를 마련했다는 점에서 의미 있는 성과라고 볼 수 있습니다.",
  ]);
});

test("단독 소개는 표시 없는 릴스만 — 큐레이션 릴스·피드·여러 가게 편엔 없다", () => {
  assert.ok(soloIntro(soloReel(null)));
  assert.equal(soloIntro(snap({ format: "reel" })), null, "큐레이션 릴스는 큐레이션 소개");
  assert.equal(soloIntro(snap({ topic: "통통주먹구이 협찬" })), null, "피드는 1003 요청 범위 밖");
  const many = soloReel(null); many.post.co_stores = 2;
  assert.equal(soloIntro(many), null);
});

test("총 시청 시간은 글에 넣지 않는다 (1003 민찬) — 잠깐 나갔던 그 문장은 자동 문장으로 알아보고 지운다", () => {
  const s = soloReel(null, { ...METRICS, total_watch_ms: 2_532_000, avg_watch_ms: 16400 });
  assert.doesNotMatch(ownerStory(s).join(" "), /시청한 시간|평균/);
  const leaked = watchParagraph(s)!;
  assert.match(leaked, /모두 합쳐 42분에 이릅니다/);
  assert.deepEqual(ownerParagraphs([...ownerStory(s).slice(0, 3), leaked, ...ownerStory(s).slice(3)], s), ownerStory(s));
});

test("팔로워가 아닌 사람 비율 — 절반 이상일 때만 쓰고, 피드에도 쓴다", () => {
  assert.equal(nonFollowerParagraph(soloReel({ non_follower_pct: 42 })), null, "절반 미만은 쓰지 않는다");
  assert.match(nonFollowerParagraph(snap({ manual: { non_follower_pct: 81 } }))!, /^조회의 81%는 우주라이크를 팔로우하지 않는 이용자에게서 나왔습니다\. 기존 팔로워를 넘어 새로운 고객에게 기프트버거를 알렸다는 뜻입니다\.$/);
  const ctx = { likes: 80, carousel: false };
  assert.deepEqual(parseManual({ non_follower_pct: "76.44" }, ctx).manual, { non_follower_pct: 76.4 });
  assert.match(parseManual({ non_follower_pct: 140 }, ctx).errors.join(" "), /0~100/);
});

test("새 문단의 숫자도 승인 가드를 통과한다 — 다른 비율을 적으면 막힌다", () => {
  const s = soloReel({ non_follower_pct: 76.4 });
  const ok = checkText(ownerStory(s).join("\n"), s);
  assert.ok(ok.ok, ok.problems.join(", "));
  assert.ok(!checkText("조회의 91%는 우주라이크를 팔로우하지 않는 이용자에게서 나왔습니다.", s).ok);
  assert.ok(!checkText("이용자들이 이 영상을 시청한 시간은 모두 합쳐 13시간에 이릅니다.", s).ok, "42분인데 13시간이라 적으면 막힌다(한 자리 수는 가드가 서수로 보고 넘긴다)");
});

test("편집 화면 한도 — 단독 릴스 글은 여섯 줄을 넘지 않고 한 줄 300자 안", () => {
  const out = ownerStory(soloReel({ non_follower_pct: 76.4, age: { p18_24: 51.2, p25_34: 32.4 } }));
  assert.ok(out.length <= 6, `${out.length}줄`);
  for (const t of out) assert.ok(t.length <= 300, `${t.length}자`);
});
