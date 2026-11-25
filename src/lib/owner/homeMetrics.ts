import { unstable_cache } from "next/cache";
import { readOwnerStoreViews, unavailableViews, type OwnerStoreViews } from "../bigquery/ownerStoreViews";

export interface PromotionBucket {
  views: number | null; reach: number | null; posts: number; measured_posts: number;
  status: string; captured_at: string | null;
}
/** 게시물 한 건의 최신 스냅샷 (백엔드 partner_metrics.post_row, 1124). 못 잰 값은 null — 0 이 아니다. */
export interface PromotionPost {
  posted_at: string; title: string; format: "carousel" | "reel" | "image" | string; permalink: string | null;
  views: number | null; reach: number | null; likes: number | null; saved: number | null;
  shares: number | null; comments: number | null;
  captured_at: string | null; status: "ok" | "stale" | "pending" | string;
  /** 이 매장으로 리포트 링크가 실제로 나간 게시물 */
  report_sent: boolean;
}
export interface HomeMetrics {
  since: string | null; as_of: string;
  coupon_used: { month: number | null; total: number | null };
  stamp: { month: number | null; total: number | null; enabled: boolean };
  /** posts 는 구 백엔드엔 없다 — 없으면 화면이 그 칸을 그리지 않는다(순차 배포 호환). */
  promotion?: { month: PromotionBucket | null; total: PromotionBucket | null; status?: string; posts?: PromotionPost[] };
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
