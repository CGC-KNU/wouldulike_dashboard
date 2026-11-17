import { unstable_cache } from "next/cache";
import { readOwnerStoreViews, unavailableViews, type OwnerStoreViews } from "../bigquery/ownerStoreViews";

export interface PromotionBucket {
  views: number | null; reach: number | null; posts: number; measured_posts: number;
  status: string; captured_at: string | null;
}
export interface HomeMetrics {
  since: string | null; as_of: string;
  coupon_used: { month: number | null; total: number | null };
  stamp: { month: number | null; total: number | null; enabled: boolean };
  promotion?: { month: PromotionBucket | null; total: PromotionBucket | null; status?: string };
  instagram?: Partial<PromotionBucket>;
  store_views?: OwnerStoreViews;
}

const cachedViews = unstable_cache(async (restaurantId: number, month: string, since: string | null, today: string) => {
  const result = await readOwnerStoreViews({ restaurantId, month, since, today });
  // 실패는 캐시하지 않는다. 매장·기간은 모두 캐시 인수에 포함된다.
  if (result.month_status === "unavailable") throw new Error("store views unavailable");
  return result;
}, ["owner-store-views-v1"], { revalidate: 3 * 60 * 60 });

type Home = { store: { restaurant_id: number; contract_started_on?: string | null }; month: string; metrics?: HomeMetrics };
export async function attachStoreViews<T extends Home>(home: T,
  read: typeof cachedViews = cachedViews,
): Promise<T> {
  if (!home.metrics) return home; // 구 백엔드와의 순차 배포 호환
  let views = unavailableViews();
  try {
    // 키가 없을 때는 Next 캐시나 외부 API를 호출하지 않는다.
    if (read !== cachedViews || process.env.GCP_SA_KEY?.trim()) {
      const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
      views = await read(home.store.restaurant_id, home.month, home.metrics.since, today);
    }
  } catch { /* GA4 장애는 쿠폰·스탬프와 독립적으로 표시한다. */ }
  return { ...home, metrics: { ...home.metrics, store_views: views } };
}
