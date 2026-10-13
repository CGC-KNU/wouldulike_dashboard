import { NextResponse } from "next/server";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { readDraft } from "@/lib/draft/store";
import { seedLeads, seedStoreOps } from "@/lib/draft/seed";
import type { BackendRestaurant, Lead, StoreOps } from "@/lib/draft/types";
import { requireTool } from "@/lib/draft/guard";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import { backendConfigured, remoteGet } from "@/lib/draft/remote";
import { checkQuality, type Benefit, type FeaturedCampaign } from "@/lib/draft/quality";

/**
 * 데이터 정합성 점검 — Probe 의 존재 이유.
 *
 * 이 화면이 왜 필요한지는 대화 기록에 그대로 있다:
 *  · 2026-09-05 "지금 제휴 아닌 하카타파스타가 튜토리얼에 뜬다" (1학기 데이터가 남아 있었다)
 *  · 2026-09-10 "첫 가입 화면 쿠폰이 실제 쿠폰 내용과 다르다"
 *  · 2026-09-05 "이런 기본적인 게 사람이 늘어나는 과정에서 아무도 언급 안 됐다는 게 더 문제"
 *
 * 전부 **사람이 우연히 볼 때까지 아무도 몰랐던** 문제다. 규칙으로 박아두면 화면이 먼저 말한다.
 * 규칙은 코드(rule)를 갖는다 — 나중에 슬랙 알림·이력 추적을 붙일 때 이 코드가 키가 된다.
 * 규칙 자체는 lib/draft/quality.ts — 여기서는 읽기만 한다.
 */

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const [restaurantsRes, benefitsRes, featuredRes, opsRes, leadsRes] = await Promise.all([
    fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/"),
    fetchBackendJson<Benefit[] | { benefits?: Benefit[] }>("/api/dashboard/restaurant-benefits/", "all=1"),
    fetchBackendJson<FeaturedCampaign[] | { results?: FeaturedCampaign[] }>(
      "/api/dashboard/admin/featured-campaigns/"
    ),
    // Astro 화면과 같은 원본 — 백엔드. 1013 전에는 여기만 9/3 초안 시드를 읽었다(lib/draft/quality.ts 머리말)
    remoteGet<{ ops?: StoreOps[] }>("/api/astro/stores/ops/"),
    remoteGet<{ leads?: Lead[] }>("/api/astro/leads/"),
  ]);

  // 200 인데 모양이 다르면(`{}` 등) "읽었다"고 치면 안 된다 — 규칙이 전부 침묵하면서 '이상 없음'이 뜬다
  const restaurantsOk = Array.isArray(restaurantsRes?.restaurants);
  const restaurants = restaurantsOk ? restaurantsRes!.restaurants! : isPreview() ? previewRestaurants() : [];
  const benefits: Benefit[] = Array.isArray(benefitsRes)
    ? benefitsRes
    : (benefitsRes?.benefits ?? []);
  const featured: FeaturedCampaign[] = Array.isArray(featuredRes)
    ? featuredRes
    : (featuredRes?.results ?? []);

  /**
   * 운영 기록·후보 — 백엔드가 답하면 그것. 백엔드가 설정돼 있는데 못 읽었으면 null(그 규칙은 침묵)이다.
   * 초안 시드로 떨어지면 안 된다: 시드는 9/3 보고라 그걸로 판정하면 끝난 입금이 「확인 안 됨」으로 뜬다.
   * 백엔드 없이 띄운 로컬·미리보기에서만 초안 저장소를 쓴다.
   */
  const pick = <T,>(r: { handled: boolean; ok: boolean; data: unknown }, field: "ops" | "leads", draft: () => T[]): T[] | null => {
    const list = (r.data as Record<string, unknown> | null)?.[field];
    if (r.handled) return r.ok && Array.isArray(list) ? (list as T[]) : null;
    return backendConfigured() ? null : draft();
  };
  const ops = pick<StoreOps>(opsRes, "ops", () => readDraft<StoreOps[]>("astro_store_ops", seedStoreOps));
  const leads = pick<Lead>(leadsRes, "leads", () => readDraft<Lead[]>("astro_leads", seedLeads));
  const fromDraft = !backendConfigured();

  const { issues, counts, test_excluded } = checkQuality({ restaurants, benefits, featured, ops, leads });

  return NextResponse.json({
    issues,
    counts,
    checked: {
      restaurants: restaurants.length - test_excluded,
      benefits: benefits.length,
      featured: featured.length,
      leads: leads?.length ?? 0,
      test_excluded,
    },
    /** 백엔드를 못 읽으면 규칙 대부분이 침묵한다. "이상 없음"과 구별해야 한다. */
    backend_reachable: restaurantsOk || isPreview(),
    /** 운영 기록(입금·비치물·학기·캠퍼스)·후보를 못 읽으면 그 규칙만 침묵한다 */
    ops_reachable: ops !== null,
    leads_reachable: leads !== null,
    generated_at: new Date().toISOString(),
    draft: fromDraft,
    ...(fromDraft ? { draft_note: "백엔드 없이 띄운 화면이라 운영 필드(입금·비치물·학기)는 초안 저장소 기준입니다." } : {}),
  });
}
