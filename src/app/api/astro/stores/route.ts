import { NextResponse } from "next/server";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { readDraft, writeDraft } from "@/lib/draft/store";
import { seedStoreOps } from "@/lib/draft/seed";
import { emptyStoreOps, type BackendRestaurant, type StoreOps } from "@/lib/draft/types";
import { requireTool } from "@/lib/draft/guard";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import { remoteGet, remoteSend } from "@/lib/draft/remote";
import { contractRowToOps, fetchTab, normName, statusRowToOps } from "@/lib/draft/sheet";
import { SALES_SHEET } from "@/lib/satellite";

/**
 * Astro 매장 목록 — 기존 `restaurants`(백엔드 원본) 와 Astro 운영 필드(`StoreOps`)를 합쳐 내려준다.
 *
 * 두 소스를 합치는 자리를 프론트가 아니라 여기(서버)에 둔 이유: 목록·상세·입금 화면이 전부
 * 같은 조합을 필요로 하는데, 화면마다 따로 합치면 세 곳이 조금씩 달라진다.
 */

/**
 * 운영 필드(계약·월 이용료·납부 방식…)를 팀 시트에서 만든다 — 저장소가 비어 있을 때만 (민열님 0913).
 *
 * 배포하면 초안 저장소가 비므로 입금 현황이 "이용료 미입력"으로 전부 빠졌다.
 * 후보 목록과 같은 원칙으로, **비어 있으면 시트가 원본**이다. 사람이 툴에서 고친 값이 있으면 시트를 읽지 않는다.
 * '계약' 탭이 플랜·월 이용료·납부 방식·계약 시작일을, '현황' 탭이 캠퍼스·상권·대표자를 채운다.
 */
async function opsFromSheet(restaurants: BackendRestaurant[], current: StoreOps[]): Promise<{ ops: StoreOps[]; error: boolean }> {
  const [contract, status] = await Promise.all([fetchTab(SALES_SHEET.tabs.계약), fetchTab(SALES_SHEET.tabs.현황)]);
  if (contract === null && status === null) return { ops: [], error: true };

  const byNorm = new Map(restaurants.map((r) => [normName(r.name), r]));
  const now = new Date().toISOString();
  // 이미 있는 행(시드·사람이 찍은 입금 확인) 위에 시트 값을 얹는다 — 지우지 않는다
  const acc = new Map<number, StoreOps>(current.map((o) => [o.id, { ...emptyStoreOps(o.id), ...o }]));

  for (const [rows, kind] of [[status ?? [], "현황"], [contract ?? [], "계약"]] as const) {
    for (const r of rows) {
      const info = kind === "계약" ? contractRowToOps(r, now) : statusRowToOps(r);
      if (!info) continue;
      const store = byNorm.get(info.norm);
      if (!store) continue;
      const base = acc.get(store.restaurant_id) ?? emptyStoreOps(store.restaurant_id);
      const next: StoreOps = { ...base };
      for (const [k, v] of Object.entries(info.patch)) {
        if (v === null || v === undefined) continue; // 시트 빈 칸이 값을 지우지 않는다
        // 툴에서 이미 찍은 입금·발행은 시트가 되돌리지 못한다 (불러오기 라우트와 같은 규칙)
        if (k === "billing" && base.billing === "PAID") continue;
        if (k === "invoice" && base.invoice === "ISSUED") continue;
        (next as unknown as Record<string, unknown>)[k] = v;
      }
      next.updated_at = now;
      next.updated_by = `sheet:${kind}`;
      acc.set(store.restaurant_id, next);
    }
  }
  return { ops: [...acc.values()], error: false };
}

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
    // 막 올린 직후라 비어 있으면 시트 값을 한 번 밀어 넣는다 (그 뒤로는 툴이 원본).
    if (restaurants.length > 0 && opsList.every((o) => !o.monthly_fee)) {
      const fromSheet = await opsFromSheet(restaurants, opsList);
      if (fromSheet.ops.length) {
        const push = await remoteSend("POST", "/api/astro/stores/ops/bulk/", { ops: fromSheet.ops });
        if (push.ok) {
          const again = await remoteGet<{ ops: StoreOps[] }>("/api/astro/stores/ops/");
          if (again.ok) opsList = again.data?.ops ?? opsList;
        } else {
          opsList = fromSheet.ops; // 못 밀어 넣었어도 이번 응답에는 보여 준다
        }
      }
    }
  } else {
    opsList = readDraft<StoreOps[]>("astro_store_ops", seedStoreOps);
  }
  // 계약 정보(월 이용료)가 **한 곳도 없으면** 시트에서 채운다. 시드만 있는 배포 직후가 그 상태다.
  if (!onBackend && restaurants.length > 0 && opsList.every((o) => !o.monthly_fee)) {
    const fromSheet = await opsFromSheet(restaurants, opsList);
    opsSource = fromSheet.error ? "sheet_error" : fromSheet.ops.length ? "sheet" : "draft";
    if (fromSheet.ops.length) {
      opsList = fromSheet.ops;
      try { writeDraft("astro_store_ops", opsList); } catch { /* 읽기 전용이면 이번 응답에만 */ }
    }
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
