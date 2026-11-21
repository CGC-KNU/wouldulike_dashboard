import { fetchBackendJson } from "../draft/toolProxy";
import { readDraft } from "../draft/store";
import { seedStoreOps } from "../draft/seed";
import { isPreview, previewRestaurants } from "../draft/previewStores";
import { remoteGet } from "../draft/remote";
import { emptyStoreOps, isPaidTier, type BackendRestaurant, type StoreOps } from "../draft/types";
import type { PaidStore } from "./types";

/**
 * 유료 식당 목록 — 「유료 식당 수 × 단가」 출금의 곱할 수.
 *
 * 정의는 Astro 입금 현황과 **같다**: 제휴 중 · 플랜이 BOOST/CONTENT · 테스트 매장 아님. 그래야 재무의 「유료 N곳」과
 * 입금 현황의 「유료 N곳」이 어긋나지 않는다. 읽는 길도 Astro 매장 목록과 같다(백엔드 식당 + 운영 필드).
 *
 * 식당 목록을 못 읽으면 **null** 이다 — 빈 배열(= 유료 식당 0곳)이 아니다. 못 읽은 걸 0 으로 곱하면
 * 나갈 돈이 0원으로 보이는 것이 가장 위험하다.
 */
export async function readPaidStores(): Promise<PaidStore[] | null> {
  const backend = await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/", "include_inactive=1");
  const restaurants = backend?.restaurants ?? (isPreview() ? previewRestaurants() : null);
  if (!restaurants) return null;

  const remote = await remoteGet<{ ops: StoreOps[] }>("/api/astro/stores/ops/");
  const opsList = remote.handled && remote.ok ? (remote.data?.ops ?? []) : readDraft<StoreOps[]>("astro_store_ops", seedStoreOps);
  const ops = new Map(opsList.map((o) => [o.id, { ...emptyStoreOps(o.id), ...o }]));

  return restaurants
    .filter((r) => r.is_affiliate !== false && isPaidTier(r.tier) && !ops.get(r.restaurant_id)?.is_test)
    .map((r) => {
      const o = ops.get(r.restaurant_id);
      const start = o?.billing_start_period || (o?.contract_started_on ? o.contract_started_on.slice(0, 7) : null);
      return { id: r.restaurant_id, name: r.name, start: start || null };
    });
}
