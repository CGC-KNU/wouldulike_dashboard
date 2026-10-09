import type { Campus, StoreMetric } from "./types";

/**
 * 매장 지표 합계 — `/api/probe/overview` 와 매장 지표 화면이 **같은 함수**로 센다.
 *
 * 화면은 캠퍼스를 고르면 그 캠퍼스 매장만으로 다시 센다. 서버 합계와 화면 합계를 따로 짜면
 * 캠퍼스별 숫자를 더해도 '제휴 전체'와 안 맞는 어긋남이 생긴다.
 */

/**
 * 캠퍼스를 안 적은 매장은 경북대로 센다 — 첫 상권이라 캠퍼스 칸이 생기기 전 매장은 비어 있을 수 있다.
 * Astro 매장 현황·Polaris 캠퍼스 집계와 같은 규칙이라 화면끼리 숫자가 맞는다.
 */
export const campusOfMetric = (s: Pick<StoreMetric, "campus">): Campus => s.campus ?? "경북대";

const isPaid = (s: StoreMetric) => s.tier === "BOOST" || s.tier === "CONTENT";

/** 이번 달 쿠폰도 스탬프도 0 인 제휴 매장. 못 읽은 매장은 0 이 아니라 모름이라 빠진다. */
export const isSilent = (s: StoreMetric) =>
  s.is_affiliate && !s.unavailable && s.coupon_redeemed_this_month === 0 && s.stamp_earned_this_month === 0;

export function summarizeStoreMetrics(stores: StoreMetric[]) {
  const live = stores.filter((s) => !s.unavailable);
  const affiliate = stores.filter((s) => s.is_affiliate);
  return {
    stores: stores.length,
    affiliate: affiliate.length,
    // 유료 + 무료 = 제휴 전체. 요금제가 비어 있는 제휴 매장은 무료로 센다(돈을 안 내는 건 같다)
    paid: affiliate.filter(isPaid).length,
    free: affiliate.filter((s) => !isPaid(s)).length,
    coupon_redeemed: live.reduce((a, s) => a + s.coupon_redeemed_this_month, 0),
    stamp_earned: live.reduce((a, s) => a + s.stamp_earned_this_month, 0),
    loyal_total: live.reduce((a, s) => a + s.loyal_total, 0),
    revisit_this_month: live.reduce((a, s) => a + s.revisit_this_month, 0),
    unavailable: stores.length - live.length,
    /** 이번 달 활동이 0인 제휴 매장 — 총합보다 이 숫자가 먼저다. */
    silent: stores.filter(isSilent).length,
  };
}

export type StoreMetricTotals = ReturnType<typeof summarizeStoreMetrics>;

/**
 * 테스트 매장은 뺀다 — Astro 「파트너 매장」과 같은 기준(제휴이고 테스트가 아닌 매장). 운영 필드의 is_test 로 안다.
 * 빼지 않으면 Probe 숫자가 Astro 보다 그만큼 크고, 조용한 매장 목록에도 테스트 매장이 섞인다.
 */
export function withoutTestStores<T extends { restaurant_id: number }>(
  rows: T[],
  ops: { id: number; is_test?: boolean | null }[]
): { rows: T[]; excluded: number } {
  const test = new Set(ops.filter((o) => o.is_test).map((o) => o.id));
  const kept = rows.filter((r) => !test.has(r.restaurant_id));
  return { rows: kept, excluded: rows.length - kept.length };
}
