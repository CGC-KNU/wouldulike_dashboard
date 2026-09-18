import { NextResponse } from "next/server";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import type { BackendRestaurant, PlanTier, StoreMetric } from "@/lib/draft/types";
import { requireTool } from "@/lib/draft/guard";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";

/**
 * Probe 지표 개요 — 매장별 쿠폰·스탬프·단골 수치를 한 번에 모아 온다.
 *
 * 지금 이 숫자들은 Astro 매장 상세 드로어에서 **한 매장씩만** 볼 수 있다. 그래서
 * "이번 달에 어느 매장이 죽어 있나"를 알려면 34번 클릭해야 한다. Probe 의 첫 화면은
 * 그 34번을 한 화면으로 바꾸는 것이다.
 *
 * 지표를 못 읽은 매장은 0 이 아니라 `unavailable: true` 로 표시한다 —
 * 0(진짜 없음)과 모름을 섞으면 "이 매장 죽었네" 같은 오판이 난다.
 */

/** 백엔드는 지표를 `stats` 아래에 싸서 준다 (page.tsx · owner/page.tsx 와 동일). */
interface StatsEnvelope {
  stats?: BackendStats;
}
interface BackendStats {
  revisit_this_month?: number;
  loyal_total?: number;
  coupon_redeemed_this_month?: number;
  stamp_earned_this_month?: number;
}

/** 백엔드를 34번 동시에 때리지 않도록 한 번에 6개씩만 보낸다. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

/** 탭을 오갈 때마다 백엔드를 35번 때리지 않도록 60초만 기억한다. 제자리는 Django 의 집계 쿼리다. */
let cached: { at: number; body: unknown } | null = null;
const TTL = 60_000;

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  if (cached && Date.now() - cached.at < TTL) return NextResponse.json(cached.body);

  const backend = await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>(
    "/api/dashboard/restaurants/"
  );
  const restaurants = backend?.restaurants ?? (isPreview() ? previewRestaurants() : []);

  /** 매장 하나를 지표 줄로. `stats` 가 null 이면 '모름'이다 — 0 으로 세면 안 된다. */
  const toMetric = (r: BackendRestaurant, stats: StatsEnvelope["stats"] | null): StoreMetric => ({
    restaurant_id: r.restaurant_id,
    name: r.name,
    tier: (r.tier as PlanTier | null) ?? null,
    is_affiliate: r.is_affiliate !== false,
    revisit_this_month: stats?.revisit_this_month ?? 0,
    loyal_total: stats?.loyal_total ?? 0,
    coupon_redeemed_this_month: stats?.coupon_redeemed_this_month ?? 0,
    stamp_earned_this_month: stats?.stamp_earned_this_month ?? 0,
    unavailable: stats === null,
  });

  /**
   * 전 매장 지표는 한 번에 받는다 (백엔드 #37). 예전에는 매장마다 `/stats/` 를 불러 34번을 때렸고
   * 응답이 25초를 넘겨 화면이 '읽지 못했습니다'로 떨어졌다. 집계가 성공하면 **줄이 없는 매장은
   * 활동이 0인 것**이지 모름이 아니다. 옛 백엔드(404)면 예전 방식으로 내려간다.
   */
  const bulk = await fetchBackendJson<{ stats?: Record<string, StatsEnvelope["stats"]> }>(
    "/api/dashboard/stats/bulk/"
  );
  const bulkStats = bulk?.stats ?? null;

  const stores: StoreMetric[] = bulkStats
    ? restaurants.map((r) => toMetric(r, bulkStats[String(r.restaurant_id)] ?? {}))
    : await mapLimit(restaurants, 6, async (r) =>
        toMetric(r, (await fetchBackendJson<StatsEnvelope>("/api/dashboard/stats/", `restaurant_id=${r.restaurant_id}`))?.stats ?? null)
      );

  const live = stores.filter((s) => !s.unavailable);
  const totals = {
    stores: stores.length,
    affiliate: stores.filter((s) => s.is_affiliate).length,
    paid: stores.filter((s) => s.tier === "BOOST" || s.tier === "CONTENT").length,
    coupon_redeemed: live.reduce((a, s) => a + s.coupon_redeemed_this_month, 0),
    stamp_earned: live.reduce((a, s) => a + s.stamp_earned_this_month, 0),
    loyal_total: live.reduce((a, s) => a + s.loyal_total, 0),
    revisit_this_month: live.reduce((a, s) => a + s.revisit_this_month, 0),
    unavailable: stores.length - live.length,
    /** 이번 달 활동이 0인 제휴 매장 — 총합보다 이 숫자가 먼저다. */
    silent: live.filter(
      (s) => s.is_affiliate && s.coupon_redeemed_this_month === 0 && s.stamp_earned_this_month === 0
    ).length,
  };

  const body = {
    stores,
    totals,
    generated_at: new Date().toISOString(),
    source: backend ? "backend" : isPreview() ? "preview-snapshot" : "unavailable",
    draft: false,
  };
  cached = { at: Date.now(), body };
  return NextResponse.json(body);
}
