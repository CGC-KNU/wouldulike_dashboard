import type { Ga4AppMetrics } from "../src/lib/bigquery/appMetrics";
import type { CouponFunnel, CouponUseFunnel } from "../src/lib/bigquery/couponFunnel";
import { parseRange } from "../src/lib/draft/appRange";
import type { CellInput } from "../src/lib/draft/appSeriesData";

/** 앱 지표 기간 × 단위 표의 테스트 재료 — appSeries · appKeyReport 테스트가 같이 쓴다. 숫자는 지어낸 것이다. */

export const TODAY = "20261015";

export function ga4(over: Partial<Ga4AppMetrics> = {}): Ga4AppMetrics {
  return {
    through: "2026-10-13", week: { from: "2026-10-05", to: "2026-10-11" },
    wau: 100, new_devices: 20, dau: 25, dau_wau: 25, mau: 300,
    open_to_store: 10, sessions: 400, sessions_with_detail: 40, sessions_detail_to_coupon: 4,
    retention_w1: 12.5, cohort: { from: "2026-09-21", to: "2026-09-27", users: 40 },
    push_open: 5, push: { from: "2026-09-28", to: "2026-10-11", received: 200, opened_android: 10, opened_ios: 2 },
    banner_to_coupon: 10, banner: { from: "2026-09-07", to: "2026-10-04", clicked: 20, redeemed: 2 },
    banner_ctr: 0, banner_view: { seen: 0, clicked: 0 },
    ...over,
  };
}

export function coupons(over: Partial<CouponFunnel> = {}): CouponFunnel {
  return {
    window: { from: "2026-10-05", to: "2026-10-11" },
    bySource: [],
    campaign: { issued: 0, redeemed: 0, rate: null },
    organic: { issued: 50, redeemed: 5, rate: 10 },
    wallet: { saw: 60, opened_use: 30, rate: 50 },
    attempt: { attempts: 10, ok: 8, failed: 2, reasons: [], rate: 80 },
    pinFailStores: [],
    coverage: { wallet_to_use: "full", redeem_outcome: "full" },
    ...over,
  };
}

export const line = (issued: number, redeemed: number) => ({ issued, screen: issued, attempt: redeemed, redeemed, pin_failed: 0 });
export function use(over: Partial<CouponUseFunnel> = {}): CouponUseFunnel {
  return { window: { from: "2026-10-05", to: "2026-10-11" }, followDays: 7, maturing: 0, organic: line(30, 3), campaign: line(0, 0), coverage: { steps: "full", failures: "full" }, ...over };
}

export const db = (stats: Record<string, number | null>, failed: string[] = []) => ({ complete: true, stats, failed });
export const full = (o: Partial<CellInput> = {}): CellInput => ({ ga4: ga4(), coupons: coupons(), use: use(), db: db({ signups: 7, coupon_issued: 10, coupon_redeemed: 3, coupon_redeem_rate: 30, stamp_earned: 12, users_redeemed: 9 }), ...o });

/** 칸 만들기 — 끝이 TODAY 뒤면 그날을 오늘로 친다(11월 · 12월 칸을 짓는 판정 테스트) */
export function spec(unit: "day" | "week" | "month", start: string, end: string) {
  const e = end.replace(/-/g, "");
  const r = parseRange({ start, end, unit }, e > TODAY ? e : TODAY);
  if (!r.ok) throw new Error(r.error);
  return r.spec;
}

