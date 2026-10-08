import type { ReportManual } from "./types";

/**
 * 인스타 앱에서 손으로 옮기는 값 (1003) — 입력 검사와 계산.
 *
 * 넣는 숫자는 두 쌍과 하나다(마케팅이 정한 목록 + 곳 수):
 *   · 썸네일 장 좋아요 수 / 가게가 실린 장 좋아요 수  → 가게 장 ÷ (전체 좋아요 − 썸네일 장)
 *   · 18~24세 비중 / 25~34세 비중                      → 둘을 더한 18~34세 비중
 *   · 큐레이션에 함께 소개한 가게 수(곳)               → 소개 문단의 "…맛집 N곳을 함께 큐레이션" (비우면 "여러 곳")
 *
 * 전체 좋아요 수는 인스타 API 값(스냅샷)이다 — 사람이 적지 않는다. 한 쌍은 둘 다 적거나 둘 다 비운다.
 * 숫자를 지어내지 않게, 앞뒤가 안 맞는 값(가게 장 좋아요가 남은 좋아요보다 많다 · 비중 합이 100 을 넘는다)은 저장하지 않는다.
 */

export interface ManualInput {
  slide_likes?: { thumb?: unknown; store?: unknown; top?: unknown } | null;
  age?: { p18_24?: unknown; p25_34?: unknown } | null;
  store_count?: unknown;
  campus_target?: unknown;
  non_follower_pct?: unknown;
}

/** 검사에 쓰는 스냅샷 값 — likes: 전체 좋아요(API) · carousel: 여러 장짜리인가 · curation: 제목에 「(… 포함)」 표시 · cards: 카드 장수 */
export interface ManualContext { likes: number | null; carousel: boolean; curation?: boolean; cards?: number | null }

const blank = (v: unknown) => v === null || v === undefined || v === "";
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
/** 소수 한 자리까지 */
const one = (v: number) => Math.round(v * 10) / 10;

export function parseManual(input: ManualInput | null | undefined, ctx: ManualContext): { manual: ReportManual | null; errors: string[] } {
  const errors: string[] = [];
  const out: ReportManual = {};

  const sl = input?.slide_likes;
  if (sl && !(blank(sl.thumb) && blank(sl.store))) {
    const thumb = num(sl.thumb), store = num(sl.store);
    if (!ctx.carousel) errors.push("장별 좋아요는 여러 장짜리 게시물(캐러셀)에서만 적습니다.");
    else if (blank(sl.thumb) || blank(sl.store)) errors.push("장별 좋아요는 썸네일 장과 가게 장 둘 다 적어 주세요.");
    else if (!Number.isInteger(thumb) || !Number.isInteger(store) || thumb < 0 || store < 0) errors.push("장별 좋아요는 0 이상의 정수로 적어 주세요.");
    else if (ctx.likes === null) errors.push("이 리포트에 전체 좋아요 수가 없어 비중을 계산할 수 없습니다. 수치를 다시 읽은 뒤 적어 주세요.");
    else if (thumb + store > ctx.likes) errors.push(`썸네일 장(${thumb}) + 가게 장(${store}) 좋아요가 전체 좋아요 ${ctx.likes}개보다 많습니다. 숫자를 다시 확인해 주세요.`);
    else if (ctx.likes - thumb <= 0) errors.push("썸네일 장을 뺀 좋아요가 0 이라 비중을 계산할 수 없습니다.");
    else out.slide_likes = { thumb, store, ...(sl.top === true ? { top: true } : {}) };
  }

  const ag = input?.age;
  if (ag && !(blank(ag.p18_24) && blank(ag.p25_34))) {
    const a = num(ag.p18_24), b = num(ag.p25_34);
    if (blank(ag.p18_24) || blank(ag.p25_34)) errors.push("연령 비중은 18~24세와 25~34세 둘 다 적어 주세요.");
    else if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0 || a > 100 || b > 100) errors.push("연령 비중은 0~100 사이의 숫자(%)로 적어 주세요.");
    else if (one(a) + one(b) > 100) errors.push(`18~24세(${one(a)}%) + 25~34세(${one(b)}%)가 100% 를 넘습니다. 숫자를 다시 확인해 주세요.`);
    else out.age = { p18_24: one(a), p25_34: one(b) };
  }

  if (!blank(input?.store_count)) {
    const c = num(input?.store_count);
    if (!ctx.curation) errors.push("가게 수는 큐레이션 콘텐츠(제목에 「(… 포함)」 표시)에서만 적습니다.");
    else if (!Number.isInteger(c) || c < 2 || c > 30) errors.push("함께 소개한 가게 수는 2~30 사이의 정수로 적어 주세요.");
    else if (ctx.carousel && typeof ctx.cards === "number" && ctx.cards > 0 && c > ctx.cards) errors.push(`가게 수(${c}곳)가 카드 장수(${ctx.cards}장)보다 많습니다. 숫자를 다시 확인해 주세요.`);
    else out.store_count = c;
  }

  if (!blank(input?.non_follower_pct)) {
    const v = num(input?.non_follower_pct);
    if (!Number.isFinite(v) || v < 0 || v > 100) errors.push("팔로워가 아닌 사람 비율은 0~100 사이의 숫자(%)로 적어 주세요.");
    else out.non_follower_pct = one(v);
  }

  // 문구 선택(대학가 문구를 쓸지) — 숫자가 아니라 검사할 게 없다
  if (typeof input?.campus_target === "boolean") out.campus_target = input.campus_target;

  const any = out.slide_likes || out.age || out.store_count || typeof out.campus_target === "boolean" || typeof out.non_follower_pct === "number";
  return { manual: any ? out : null, errors };
}

/** 가게 장 좋아요 비중(%) — 가게 장 ÷ (전체 좋아요 − 썸네일 장). 계산할 수 없으면 null */
export function slideShare(manual: ReportManual | null | undefined, likes: number | null | undefined): number | null {
  const sl = manual?.slide_likes;
  if (!sl || typeof likes !== "number") return null;
  const rest = likes - sl.thumb;
  if (rest <= 0 || sl.store > rest) return null;
  return one((sl.store / rest) * 100);
}

/**
 * 가게 장이 함께 소개된 가게 중 좋아요 1위인가 — 사람이 확인했거나(top), 남은 좋아요를 한 가게가 다 받아도 못 넘을 때.
 * 숫자 둘(썸네일 장 · 가게 장)만으로는 다른 가게들이 어떻게 나눠 가졌는지 모른다. 그래서 확인 없이 "가장 높은"이라고 쓰지 않는다.
 */
export function slideTop(manual: ReportManual | null | undefined, likes: number | null | undefined): boolean {
  const sl = manual?.slide_likes;
  if (!sl || typeof likes !== "number") return false;
  if (sl.top === true) return true;
  return sl.store > likes - sl.thumb - sl.store;
}

/** 18~24세 · 25~34세 · 둘의 합(18~34세) */
export function ageShare(manual: ReportManual | null | undefined): { p18_24: number; p25_34: number; sum: number } | null {
  const a = manual?.age;
  if (!a) return null;
  return { p18_24: a.p18_24, p25_34: a.p25_34, sum: one(a.p18_24 + a.p25_34) };
}

/**
 * 아직 안 적은 손 입력 — 승인 전에 경고를 띄우는 데 쓴다(1007). 막지는 않는다: 경고를 보고도 승인하면 그대로 나간다.
 * carousel: 캐러셀이면 장별 좋아요, curation: 큐레이션이면 함께 소개한 가게 수. 연령은 늘 본다.
 */
export function manualMissing(manual: ReportManual | null | undefined, ctx: { carousel: boolean; curation: boolean }): string[] {
  const out: string[] = [];
  if (ctx.carousel && !manual?.slide_likes) out.push("썸네일 장 · 가게 장 좋아요 수");
  if (!manual?.age) out.push("18~24세 · 25~34세 비중");
  if (ctx.curation && !manual?.store_count) out.push("함께 소개한 가게 수");
  return out;
}
