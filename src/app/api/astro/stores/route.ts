import { NextResponse } from "next/server";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { readDraft } from "@/lib/draft/store";
import { seedStoreOps } from "@/lib/draft/seed";
import { emptyStoreOps, type BackendRestaurant, type StoreOps } from "@/lib/draft/types";
import { requireTool } from "@/lib/draft/guard";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";

/**
 * Astro 매장 목록 — 기존 `restaurants`(백엔드 원본) 와 Astro 운영 필드(`StoreOps`)를 합쳐 내려준다.
 *
 * 두 소스를 합치는 자리를 프론트가 아니라 여기(서버)에 둔 이유: 목록·상세·입금 화면이 전부
 * 같은 조합을 필요로 하는데, 화면마다 따로 합치면 세 곳이 조금씩 달라진다.
 */

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;

  const backend = await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>(
    "/api/dashboard/restaurants/"
  );
  // 백엔드가 없고 미리보기 모드면 실측 스냅샷으로 화면을 돌려본다 (previewStores.ts 주석 참고)
  const restaurants = backend?.restaurants ?? (isPreview() ? previewRestaurants() : []);

  // 운영 필드는 아직 백엔드에 테이블이 없다 — 초안 저장소에서 읽는다
  const opsList = readDraft<StoreOps[]>("astro_store_ops", seedStoreOps);
  // 스키마가 늘어도 예전 행이 깨지지 않게 기본값 위에 얹는다
  const opsById = new Map(opsList.map((o) => [o.id, { ...emptyStoreOps(o.id), ...o }]));

  const stores = restaurants.map((r) => ({
    restaurant_id: r.restaurant_id,
    name: r.name,
    tier: r.tier,
    is_affiliate: r.is_affiliate !== false,
    ops: opsById.get(r.restaurant_id) ?? null,
  }));

  return NextResponse.json({
    stores,
    // 매장 본체는 실데이터, 운영 필드만 초안이다. 화면이 이 둘을 구분해 표시한다.
    restaurants_source: backend ? "backend" : isPreview() ? "preview-snapshot" : "unavailable",
    ops_source: "draft",
    draft: true,
    draft_note:
      "매장·플랜은 실데이터입니다. 입금·학기/방학·비치물 등 운영 필드는 백엔드 테이블이 생기기 전까지 초안 저장소를 씁니다.",
  });
}
