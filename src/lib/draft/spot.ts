/**
 * 스팟 제작 — 제휴와 별개로 파는 콘텐츠 제작 건 (민열님 0914).
 *
 * 파트너 매장은 월 구독이고 스팟은 한 편씩 파는 것이다. 서서맥주·후추처럼
 * 제휴를 안 해도 사 가는 곳이 있어서 후보·매장과 섞지 않는다.
 * 담당은 스팟 제작 AE(윤지님)다.
 */

export const SPOT_STAGES = ["컨택", "미팅", "기획안", "계약", "촬영", "편집", "납품", "정산"] as const;
export const SPOT_SIDE_STAGES = ["보류", "거절"] as const;
export type SpotStage = (typeof SPOT_STAGES)[number] | (typeof SPOT_SIDE_STAGES)[number];
export const ALL_SPOT_STAGES: readonly SpotStage[] = [...SPOT_STAGES, ...SPOT_SIDE_STAGES];

/** 상품과 정가. 정가는 '부르는 값'이고 건마다 다르게 받을 수 있다. */
export const SPOT_PRODUCTS = [
  { key: "CARD", label: "카드뉴스", shoot: false, price: 100_000 },
  { key: "CARD_SHOOT", label: "카드뉴스 + 촬영", shoot: true, price: 150_000 },
  { key: "REELS", label: "릴스", shoot: false, price: 150_000 },
  { key: "REELS_SHOOT", label: "릴스 + 촬영", shoot: true, price: 200_000 },
] as const;
export type SpotProduct = (typeof SPOT_PRODUCTS)[number]["key"];

export function productOf(key: string | null | undefined) {
  return SPOT_PRODUCTS.find((p) => p.key === key) ?? null;
}
/**
 * 적어 둔 금액이 있으면 그것, 없으면 정가. 둘 다 없으면 null — 지어내지 않는다.
 *
 * **0원은 적어 둔 금액이다.** 첫 건을 무료로 주는 일이 실제로 있다(교동 서서·후추, 0914).
 * 0 을 '안 적음'으로 보면 화면이 조용히 정가를 되살려서, 무료로 준 건이 받을 돈에 얹힌다.
 */
export function spotAmount(s: { product: string | null; price: number | null }): number | null {
  if (typeof s.price === "number" && s.price >= 0) return s.price;
  return productOf(s.product)?.price ?? null;
}

export interface SpotJob {
  id: string;
  name: string;
  campus: string | null;
  district: string | null;
  category: string | null;
  stage: SpotStage;
  owner: string | null;
  product: SpotProduct | null;
  price: number | null;
  list_price: number | null;
  owner_name: string | null;
  contact: string | null;
  insta: string | null;
  map_url: string | null;
  restaurant_id: number | null;
  meeting_at: string | null;
  shoot_at: string | null;
  due: string | null;
  delivered_at: string | null;
  paid_at: string | null;
  /** 기획안을 **보낸** 날. 링크가 있는 것과 보낸 것은 다르다 — 만들어 두고 못 보낸 건이 막힌 자리다. */
  plan_sent_at: string | null;
  plan_url: string | null;
  next_action: string | null;
  memo: string | null;
  last_touch_at: string | null;
  created_at: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

export const SPOT_EDITABLE = [
  "name", "campus", "district", "category", "stage", "owner",
  "product", "price", "owner_name", "contact", "insta", "map_url", "restaurant_id",
  "meeting_at", "shoot_at", "due", "delivered_at", "paid_at",
  "plan_sent_at", "plan_url", "next_action", "memo",
] as const;
