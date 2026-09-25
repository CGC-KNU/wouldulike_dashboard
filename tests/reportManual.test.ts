import { test } from "node:test";
import assert from "node:assert/strict";
import { manualShows, manualToInput, normalizeAgeRange, parseManual } from "../src/lib/draft/reportManual";

// 인스타 앱에서 옮기는 값 — 연령 비중 · 캐러셀 슬라이드 좋아요 비중 (API 로 못 받는다, 0926)

test("연령대는 흔한 적는 법을 18~34 로 맞춘다", () => {
  assert.equal(normalizeAgeRange("18~34"), "18~34");
  assert.equal(normalizeAgeRange("18 - 34세"), "18~34");
  assert.equal(normalizeAgeRange("65+"), "65+");
  assert.equal(normalizeAgeRange("34~18"), null, "거꾸로면 받지 않는다");
  assert.equal(normalizeAgeRange("대학생"), null);
});

test("기프트버거 참고문 값이 그대로 저장된다", () => {
  const { manual, errors } = parseManual({ age_range: "18~34", age_pct: "83.6", slide_pct: "38.8%", slide_rank: "1" }, 7);
  assert.deepEqual(errors, []);
  assert.deepEqual(manual, { audience: { age_range: "18~34", pct: 83.6 }, slide_likes: { pct: 38.8, rank: 1 } });
});

test("빈 칸은 null — 리포트에 카드를 띄우지 않는다", () => {
  assert.deepEqual(parseManual({}, 7), { manual: { audience: null, slide_likes: null }, errors: [] });
  assert.deepEqual(parseManual({ age_range: " ", age_pct: "", slide_pct: "", slide_rank: "" }, 7).manual, { audience: null, slide_likes: null });
});

test("잘못 적으면 저장하지 않고 이유를 말한다", () => {
  assert.ok(parseManual({ age_range: "18~34" }, 7).errors.length, "비중이 없으면 막는다");
  assert.ok(parseManual({ age_range: "18~34", age_pct: "120" }, 7).errors.length, "100 초과");
  assert.ok(parseManual({ slide_pct: "30", slide_rank: "9" }, 7).errors.length, "7곳인데 9위");
  assert.ok(parseManual({ slide_pct: "30" }, 1).errors.length, "단독 편에는 슬라이드 비중이 없다");
  assert.equal(parseManual({ slide_pct: "30" }, 7).manual.slide_likes?.rank, null, "순위는 비워도 된다");
});

test("표시 조건은 양식 v1.0 과 같다 — 연령 50% 이상, 슬라이드는 똑같이 나눈 몫보다 클 때", () => {
  const s = manualShows({ audience: { age_range: "18~24", pct: 41 }, slide_likes: { pct: 14, rank: 3 } }, 7);
  assert.equal(s.audience, false);
  assert.equal(s.slide, false, "7곳이면 14.3% 이하는 안 뜬다");
  assert.equal(manualShows({ audience: { age_range: "18~34", pct: 83.6 }, slide_likes: { pct: 38.8, rank: 1 } }, 7).slide, true);
});

test("저장된 값을 편집 칸으로 되돌린다", () => {
  assert.deepEqual(manualToInput({ audience: { age_range: "18~34", pct: 83.6 }, slide_likes: { pct: 38.8, rank: null } }),
    { age_range: "18~34", age_pct: "83.6", slide_pct: "38.8", slide_rank: "" });
  assert.deepEqual(manualToInput(undefined), { age_range: "", age_pct: "", slide_pct: "", slide_rank: "" });
});
