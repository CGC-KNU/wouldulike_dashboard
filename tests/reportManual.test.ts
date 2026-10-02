import { test } from "node:test";
import assert from "node:assert/strict";
import { ageShare, parseManual, slideShare } from "../src/lib/draft/reportManual";
import { checkText, ownerParagraphs, ownerStory, refreshText } from "../src/lib/draft/report";
import { toTemplateData } from "../src/lib/draft/reportTemplateData";
import type { StoreReport } from "../src/lib/draft/types";
import type { ReportData, ReportManual, ReportSnapshot } from "../src/lib/draft/types";

/**
 * 인스타 앱에서 손으로 옮기는 값 (1003 — 마케팅이 정한 두 쌍).
 *   · 썸네일 장 좋아요 / 가게 장 좋아요 → 가게 장 ÷ (전체 좋아요 − 썸네일 장)
 *   · 18~24세 / 25~34세 비중           → 둘을 더한 18~34세 비중
 */

const rd = (format: string, metrics: Record<string, number>): ReportData => ({
  available: true, day: 14, window: "D14", measured_at: "2026-09-29",
  post: { posted_at: "2026-09-15", permalink: "https://www.instagram.com/p/x/", format, thumb_url: "", caption: "", card_count: 9 },
  metrics,
});
const snap = (manual: ReportManual | null, format = "carousel", topic = "대구 수제버거 맛집 (기프트버거 포함)"): ReportSnapshot => ({
  store: { name: "기프트버거", campus: null },
  post: { plan_id: 1, topic, posted_at: "2026-09-15T18:00:00+09:00", permalink: "https://www.instagram.com/p/x/", format, caption: null, cover_url: null, owner_name: null, co_stores: 1 },
  as_of: "2026-09-29T03:00:00Z", basis: "D7", age_days: 14, collecting: false, metrics: [], cohort_note: null, app: null,
  report_data: rd(format, { views: 6674, reach: 3482, shares: 105, saved: 67, likes: 66, comments: 3, total_interactions: 241 }),
  manual,
});
const CAROUSEL: { likes: number | null; carousel: boolean } = { likes: 66, carousel: true };

test("가게 장 비중 = 가게 장 ÷ (전체 좋아요 − 썸네일 장)", () => {
  const { manual, errors } = parseManual({ slide_likes: { thumb: "12", store: "21" } }, CAROUSEL);
  assert.deepEqual(errors, []);
  assert.deepEqual(manual, { slide_likes: { thumb: 12, store: 21 } });
  assert.equal(slideShare(manual, 66), 38.9, "21 ÷ (66 − 12) = 38.9%");
  assert.equal(slideShare(manual, null), null, "전체 좋아요를 모르면 계산하지 않는다");
});

test("18~24세 + 25~34세 = 18~34세 비중, 소수 한 자리", () => {
  const { manual, errors } = parseManual({ age: { p18_24: "51.24", p25_34: 32.4 } }, CAROUSEL);
  assert.deepEqual(errors, []);
  assert.deepEqual(ageShare(manual), { p18_24: 51.2, p25_34: 32.4, sum: 83.6 });
});

test("앞뒤가 안 맞는 값은 저장하지 않는다", () => {
  const bad = (input: Parameters<typeof parseManual>[0], ctx = CAROUSEL) => parseManual(input, ctx).errors.join(" ");
  assert.match(bad({ slide_likes: { thumb: 12, store: "" } }), /둘 다 적어/);
  assert.match(bad({ slide_likes: { thumb: 40, store: 30 } }), /전체 좋아요 66개보다 많습니다/);
  assert.match(bad({ slide_likes: { thumb: 1.5, store: 3 } }), /정수/);
  assert.match(bad({ slide_likes: { thumb: 66, store: 0 } }), /0 이라 비중을 계산할 수 없습니다/);
  assert.match(bad({ slide_likes: { thumb: 3, store: 4 } }, { likes: null, carousel: true }), /전체 좋아요 수가 없어/);
  assert.match(bad({ slide_likes: { thumb: 3, store: 4 } }, { likes: 66, carousel: false }), /캐러셀/);
  assert.match(bad({ age: { p18_24: 60, p25_34: 50 } }), /100% 를 넘습니다/);
  assert.match(bad({ age: { p18_24: 60, p25_34: "" } }), /둘 다 적어/);
  assert.match(bad({ age: { p18_24: -1, p25_34: 5 } }), /0~100/);
});

test("둘 다 비우면 값이 없다 — 오류도 아니다", () => {
  assert.deepEqual(parseManual({ slide_likes: { thumb: "", store: "" }, age: { p18_24: "", p25_34: null } }, CAROUSEL), { manual: null, errors: [] });
  assert.deepEqual(parseManual(null, CAROUSEL), { manual: null, errors: [] });
});

const BOTH: ReportManual = { slide_likes: { thumb: 12, store: 21 }, age: { p18_24: 51.2, p25_34: 32.4 } };

test("값을 넣으면 해석 글에 문장이 붙는다 — 연령은 조회수 문단에, 슬라이드는 그다음 문단으로", () => {
  const out = ownerStory(snap(BOTH));
  assert.equal(out.length, 5, "인사 · 큐레이션 소개 · 조회수+연령 · 슬라이드 · 총반응 수");
  assert.equal(out[2], "해당 콘텐츠는 총 6,674회의 조회수를 기록했습니다. 또한 도달한 이용자의 83.6%가 18~34세로, 젊은 고객층을 중심으로 노출되었습니다.");
  assert.equal(out[3], "슬라이드별 반응을 살펴보면, 썸네일을 제외했을 때 전체 좋아요 수의 38.9%가 기프트버거 슬라이드에서 발생했습니다.");
  assert.match(out[4], /^또한 좋아요, 댓글, 저장, 공유 등 이용자의 실제 행동을 나타내는 총반응 수는 241건으로 집계되었습니다\./);
});

test("값이 없으면 그 문장은 없다 · 릴스에는 슬라이드 문단이 없다", () => {
  assert.ok(!ownerStory(snap(null)).some((t) => /18~34세|슬라이드/.test(t)));
  const reel = ownerStory(snap(BOTH, "reel", "교동후추 협찬"));
  assert.ok(reel.some((t) => t.includes("도달한 이용자의 83.6%가 18~34세로")));
  assert.ok(!reel.some((t) => t.includes("슬라이드")), "릴스는 장이 없다");
});

test("손으로 넣은 값의 숫자는 승인 가드를 통과하고, 다른 숫자를 적으면 막힌다", () => {
  const s = snap(BOTH);
  const ok = checkText(ownerStory(s).join("\n"), s);
  assert.ok(ok.ok, ok.problems.join(", "));
  const forged = checkText("이번 콘텐츠를 본 분들 가운데 91.3%가 18~34세였습니다.", s);
  assert.ok(!forged.ok, "넣은 적 없는 91 은 스냅샷에 없는 수치다");
});

test("값을 넣거나 고치면 손대지 않은 자동 문장만 새 값으로 다시 쓴다", () => {
  const before = snap(null), after = snap(BOTH);
  const kept = "사장님 메뉴 사진이 특히 반응이 좋았습니다.";
  const out = refreshText({ summary: "", interpretation: [...ownerStory(before), kept], snapshot: before }, after);
  assert.deepEqual(out.interpretation, [...ownerStory(after), kept]);
  // 이미 넣은 값을 고칠 때 — 옛 값으로 쓴 문장도 자동 문장으로 알아본다
  const changed = snap({ ...BOTH, age: { p18_24: 40, p25_34: 30 } });
  const again = refreshText({ summary: "", interpretation: [...ownerStory(after), kept], snapshot: after }, changed);
  assert.ok(again.interpretation!.some((t) => t.includes("70%가 18~34세")));
  assert.ok(!again.interpretation!.some((t) => t.includes("83.6%")));
  assert.deepEqual(ownerParagraphs([...ownerStory(after), kept], after), [...ownerStory(after), kept]);
});

// ── 큐레이션에 함께 소개한 가게 수 — 데이터에 없어 사람이 적는다 (1003) ─────────────
const CURATION = { likes: 66, carousel: true, curation: true, cards: 9 };

test("가게 수를 적으면 소개 문단이 「N곳」, 비우면 「여러 곳」", () => {
  const { manual, errors } = parseManual({ store_count: "7" }, CURATION);
  assert.deepEqual(errors, []);
  assert.deepEqual(manual, { store_count: 7 });
  assert.match(ownerStory(snap(manual))[1], /^이번 콘텐츠는 수제버거 맛집으로 알려진 대구 지역 맛집 7곳을 함께 큐레이션하는 방식으로 제작되었습니다\./);
  assert.match(ownerStory(snap(null))[1], /대구 지역 맛집 여러 곳을 함께 큐레이션/);
  const s = snap(manual);
  const guard = checkText(ownerStory(s).join("\n"), s);
  assert.ok(guard.ok, guard.problems.join(", "));
});

test("가게 수 — 큐레이션이 아니면 받지 않고, 카드 장수보다 많거나 2곳 미만이면 저장하지 않는다", () => {
  const bad = (v: unknown, ctx = CURATION) => parseManual({ store_count: v }, ctx).errors.join(" ");
  assert.match(bad(7, { ...CURATION, curation: false }), /큐레이션 콘텐츠/);
  assert.match(bad(10), /카드 장수\(9장\)보다 많습니다/);
  assert.match(bad(1), /2~30/);
  assert.match(bad(3.5), /2~30/);
  assert.equal(bad(""), "", "비우는 건 오류가 아니다");
  assert.equal(bad(12, { ...CURATION, carousel: false, cards: 0 }), "", "릴스 큐레이션은 카드 장수와 견주지 않는다");
});

test("가게 수를 나중에 넣어도 손대지 않은 소개 문단이 그 숫자로 다시 쓰인다", () => {
  const before = snap(null), after = snap({ store_count: 7 });
  const out = refreshText({ summary: "", interpretation: ownerStory(before), snapshot: before }, after);
  assert.deepEqual(out.interpretation, ownerStory(after));
});

test("글을 통째로 고쳐 소개 문단이 빠졌을 때의 안내 문장도 손으로 넣은 가게 수를 먼저 쓴다", () => {
  const base = snap({ store_count: 7 });
  const r = { id: "r", token: null, restaurant_id: 1, plan_id: 1, kind: "post", status: "DRAFT", title: "t", summary: "", proposals: [],
    interpretation: ["사람이 다 고쳐 쓴 문단입니다."], snapshot: { ...base, post: { ...base.post, co_stores: 3 } },
    created_by: "", created_at: "", approved_by: null, approved_at: null, linked_at: null, sent_at: null, revoked_at: null,
    views: { count: 0, first_at: null, last_at: null } } as StoreReport;
  const d = toTemplateData(r) as { insight: { limitation: string | null }; post: { store_count: number | null } };
  assert.match(d.insight.limitation!, /주제로 7곳을 함께 소개한 큐레이션입니다/, "제목에서 센 3곳이 아니라 적은 7곳");
  assert.equal(d.post.store_count, 7);
});
