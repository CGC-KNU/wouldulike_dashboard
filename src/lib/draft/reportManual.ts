import type { ReportManual } from "./types";

/**
 * 인스타 앱에서 손으로 옮기는 값 — 게시물 단위 연령 비중, 캐러셀 슬라이드별 좋아요 비중.
 *
 * 둘 다 API 로는 못 받는다(0926 확인: 게시물 인사이트엔 연령 나눠 보기가 없고, 캐러셀 안 사진의 like_count 는
 * "(#100) Field is not available for Carousel children media."). 그래서 리포트마다 사람이 적는다.
 * 저장은 스냅샷의 `manual` — 양식 v1.0 이 `manual.audience` · `manual.slide_likes` 로 읽고, 보여 줄 만할 때만 카드를 띄운다.
 *
 * 편집 화면(입력 중 미리 검사)과 서버(PATCH)가 같은 함수를 쓴다.
 */

export interface ManualInput {
  age_range?: string;
  age_pct?: string | number;
  slide_pct?: string | number;
  slide_rank?: string | number;
}

const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";
const toNum = (v: unknown) => Number(String(v).trim().replace(/%$/, "").replace(/,/g, ""));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** "18~34" · "18-34" · "18 ~ 34" → "18~34", "65+" 는 그대로. 아니면 null */
export function normalizeAgeRange(s: string): string | null {
  const t = s.trim();
  const m = /^(\d{1,2})\s*[~\-–]\s*(\d{1,2})\s*세?$/.exec(t);
  if (m) return Number(m[1]) < Number(m[2]) ? `${Number(m[1])}~${Number(m[2])}` : null;
  const plus = /^(\d{1,2})\s*\+\s*세?$/.exec(t);
  return plus ? `${Number(plus[1])}+` : null;
}

/**
 * 입력 칸 → 저장할 값. 빈 칸 묶음은 null(카드를 안 띄운다). 잘못된 값은 errors 로 돌려준다.
 * coStores: 함께 소개한 가게 수 — 슬라이드 비중은 여러 가게 편에서만 뜻이 있다.
 */
export function parseManual(input: ManualInput, coStores: number): { manual: ReportManual; errors: string[] } {
  const errors: string[] = [];
  let audience: ReportManual["audience"] = null;
  let slide: ReportManual["slide_likes"] = null;

  if (!blank(input.age_range) || !blank(input.age_pct)) {
    const range = blank(input.age_range) ? null : normalizeAgeRange(String(input.age_range));
    const pct = toNum(input.age_pct);
    if (!range) errors.push("연령대는 18~34 처럼 적어 주세요.");
    if (blank(input.age_pct) || !Number.isFinite(pct) || pct <= 0 || pct > 100) errors.push("연령 비중은 0보다 크고 100 이하인 % 숫자예요.");
    if (!errors.length && range) audience = { age_range: range, pct: round1(pct) };
  }

  if (!blank(input.slide_pct) || !blank(input.slide_rank)) {
    const before = errors.length;
    const pct = toNum(input.slide_pct);
    const rank = blank(input.slide_rank) ? null : toNum(input.slide_rank);
    if (coStores < 2) errors.push("슬라이드 비중은 여러 가게를 함께 소개한 편에서만 적습니다.");
    if (blank(input.slide_pct) || !Number.isFinite(pct) || pct <= 0 || pct > 100) errors.push("슬라이드 좋아요 비중은 0보다 크고 100 이하인 % 숫자예요.");
    if (rank !== null && (!Number.isInteger(rank) || rank < 1 || (coStores >= 2 && rank > coStores))) errors.push(`순위는 1부터 ${Math.max(coStores, 1)} 사이 정수예요.`);
    if (errors.length === before) slide = { pct: round1(pct), rank };
  }

  return { manual: { audience, slide_likes: slide }, errors };
}

/** 저장된 값 → 입력 칸 문자열 (편집 화면 초기값) */
export function manualToInput(m: ReportManual | null | undefined): Required<{ [K in keyof ManualInput]: string }> {
  return {
    age_range: m?.audience?.age_range ?? "",
    age_pct: m?.audience ? String(m.audience.pct) : "",
    slide_pct: m?.slide_likes ? String(m.slide_likes.pct) : "",
    slide_rank: m?.slide_likes?.rank != null ? String(m.slide_likes.rank) : "",
  };
}

/** 양식 v1.0 과 같은 표시 조건 — 편집 화면이 "이 값이면 리포트에 뜨는지"를 미리 알려 준다 */
export function manualShows(m: ReportManual | null | undefined, coStores: number): { audience: boolean; slide: boolean; even: number | null } {
  const even = coStores >= 2 ? 100 / coStores : null;
  return {
    audience: Boolean(m?.audience && m.audience.pct >= 50),
    slide: Boolean(m?.slide_likes && even !== null && m.slide_likes.pct > even),
    even,
  };
}
