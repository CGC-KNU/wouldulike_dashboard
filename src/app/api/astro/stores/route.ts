import { NextResponse } from "next/server";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { readDraft, writeDraft } from "@/lib/draft/store";
import { seedStoreOps } from "@/lib/draft/seed";
import { emptyStoreOps, type BackendRestaurant, type StoreOps } from "@/lib/draft/types";
import { requireTool } from "@/lib/draft/guard";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import { remoteGet, remoteSend } from "@/lib/draft/remote";

/**
 * Astro 매장 목록 — 기존 `restaurants`(백엔드 원본) 와 Astro 운영 필드(`StoreOps`)를 합쳐 내려준다.
 *
 * 두 소스를 합치는 자리를 프론트가 아니라 여기(서버)에 둔 이유: 목록·상세·입금 화면이 전부
 * 같은 조합을 필요로 하는데, 화면마다 따로 합치면 세 곳이 조금씩 달라진다.
 */

export async function GET(req: Request) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;

  // 값을 바꾼 직후의 재조회는 캐시를 건너뛴다 — 안 그러면 바꾸기 전 값이 돌아온다 (toolProxy 주석 참고)
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";

  // 계약이 끝난 매장(비제휴)도 같이 받는다 — 제휴를 끄면 목록에서 사라져 되돌릴 수 없던 문제.
  // 앱은 그대로다. 이 옵션은 관리자 목록에서만 켜진다.
  const backend = await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>(
    "/api/dashboard/restaurants/",
    "include_inactive=1",
    fresh
  );
  // 백엔드가 없고 미리보기 모드면 실측 스냅샷으로 화면을 돌려본다 (previewStores.ts 주석 참고)
  const restaurants = backend?.restaurants ?? (isPreview() ? previewRestaurants() : []);

  // 운영 필드의 원본 — 백엔드(astro 앱)가 살아 있으면 거기, 아니면 초안 저장소.
  let opsList: StoreOps[];
  let opsSource: "backend" | "draft" | "sheet" | "sheet_error" = "draft";
  const remote = await remoteGet<{ ops: StoreOps[] }>("/api/astro/stores/ops/");
  const onBackend = remote.handled && remote.ok;
  if (onBackend) {
    opsList = remote.data?.ops ?? [];
    opsSource = "backend";
  } else {
    opsList = readDraft<StoreOps[]>("astro_store_ops", seedStoreOps);
  }
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
    ops_source: opsSource,
    draft: !onBackend,
    draft_note: onBackend
      ? undefined
      : "매장·플랜은 실데이터입니다. 입금·학기/방학·비치물 등 운영 필드는 백엔드 테이블이 생기기 전까지 초안 저장소를 씁니다.",
  });
}
