/** 개발 모드 플래그 */
export const IS_DEV = process.env.NODE_ENV === "development";

/** 개발 환경 고정 더미 — 정든밤 */
export const DEV_RESTAURANT = {
  restaurant_id: 9999,
  name: "정든밤",
  tier: "BOOST" as const,
};

export const DEV_STATS = {
  revisit_this_month: 24,
  loyal_total: 87,
  coupon_redeemed_this_month: 86,
  stamp_earned_this_month: 142,
  restaurant_name: "정든밤",
  tier: "BOOST",
  month: "2026-06",
};
