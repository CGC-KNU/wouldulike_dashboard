import { NextResponse } from "next/server";
import { fetchBackendJson, fetchBackendResult } from "@/lib/draft/toolProxy";
import type { BackendRestaurant, PlanTier, StoreMetric, StoreOps } from "@/lib/draft/types";
import { requireTool } from "@/lib/draft/guard";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import { remoteGet } from "@/lib/draft/remote";
import { readDraft } from "@/lib/draft/store";
import { seedStoreOps } from "@/lib/draft/seed";
import { previousPeriod, summarizeStoreMetrics, withoutTestStores } from "@/lib/draft/storeMetrics";
import { singleFlight } from "@/lib/draft/singleFlight";

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
  coupon_users_this_month?: number;
  active_users_this_month?: number;
  voucher_redeemed_this_month?: number;
  mileage_earners_this_month?: number;
}

/** 백엔드 월별 스냅샷(`/api/dashboard/admin/metric-snapshots/?restaurants=1`) — 필요한 칸만 */
interface SnapshotEnvelope {
  current?: { complete?: boolean; counted_at?: string } | null;
  restaurants?: Record<string, { coupon_redeemed?: number; stamp_earned?: number }>;
}

/** 탭을 오갈 때마다 백엔드를 35번 때리지 않도록 60초만 기억한다. 제자리는 Django 의 집계 쿼리다. */
let cached: { at: number; body: unknown } | null = null;
const TTL = 60_000;

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  if (cached && Date.now() - cached.at < TTL) return NextResponse.json(cached.body);
  // 런처(Polaris) · Probe 홈 · 매장 지표가 처음 열릴 때 거의 동시에 부른다 — 만드는 중이면 그걸 같이 기다린다(1027)
  return NextResponse.json(await build());
}

const build = singleFlight(async () => {
  const backend = await fetchBackendJson<{ restaurants?: BackendRestaurant[]; truncated?: boolean }>(
    "/api/dashboard/restaurants/"
  );
  /**
   * 0925: 매장 목록을 못 읽으면 `[]` 가 되어 모든 합계가 0 이 되고, 화면은
   * "제휴 매장 0곳 · 지표 못 읽음 0곳" 을 띄웠다 — 아무것도 못 읽은 그 순간에
   * "못 읽은 곳이 없다" 고 말한 셈이다. 못 읽었다는 사실을 같이 내려보낸다.
   */
  const storesUnreadable = backend?.restaurants === undefined && !isPreview();
  const allRestaurants = backend?.restaurants ?? (isPreview() ? previewRestaurants() : []);

  /** 캠퍼스는 Astro 운영 필드에 있다 — 읽는 길은 `/api/astro/stores` 와 같다(백엔드, 안 되면 초안). */
  const opsRemote = await remoteGet<{ ops: StoreOps[] }>("/api/astro/stores/ops/");
  const opsList = opsRemote.handled && opsRemote.ok ? (opsRemote.data?.ops ?? []) : readDraft<StoreOps[]>("astro_store_ops", seedStoreOps);
  const campusById = new Map(opsList.map((o) => [o.id, o.campus ?? null]));
  // Astro 「파트너 매장」과 같은 기준 — 테스트 매장은 처음부터 뺀다(1009). 몇 곳 뺐는지는 화면이 적는다
  const { rows: restaurants, excluded: testExcluded } = withoutTestStores(allRestaurants, opsList);

  /**
   * 전 매장 지표는 한 번에 받는다 (백엔드 #37). 집계가 성공하면 **줄이 없는 매장은 활동이 0인 것**이지 모름이 아니다.
   * 못 읽으면 전부 '모름'(unavailable)이다. 1013 전에는 이때 매장마다 `/stats/` 를 34번 부르는 옛 길로 내려갔는데,
   * 그 길이 25초를 넘겨 '읽지 못했습니다'로 떨어져서 bulk 를 만든 것이다 — 같은 실패를 한 번 더 기다릴 이유가 없다.
   *
   * 지난달(1014)은 백엔드가 매일 굳히는 월별 스냅샷에서 읽는다 — bulk 와 같은 함수(count_restaurant_metrics)로 센 값이다.
   * 이번 달 누계만 있으면 월초에는 모든 매장이 「조용함」인데, 지난달 숫자가 옆에 있으면 그게 달이 막 시작해서인지 보인다.
   * 404 는 그 달 스냅샷이 아직 없는 것(굳기 전) · 그 밖의 실패는 못 읽음 — 어느 쪽이든 지난달 줄은 비운다(0 이 아니다).
   */
  const prevPeriod = previousPeriod();
  const [bulk, snap, benefitsRes] = await Promise.all([
    fetchBackendJson<{ stats?: Record<string, StatsEnvelope["stats"]>; prev_same_days?: { stats?: Record<string, { coupon_redeemed?: number; stamp_earned?: number; voucher_redeemed?: number }> } }>("/api/dashboard/stats/bulk/", "prev_same_days=1"),
    fetchBackendResult<SnapshotEnvelope>("/api/dashboard/admin/metric-snapshots/", `period=${prevPeriod}&restaurants=1`),
    // 혜택 수 — 정합성 「유료인데 혜택 0건」 규칙이 세는 것과 같은 원본(restaurant-benefits)
    fetchBackendJson<{ benefits?: { restaurant_id: number; kind: string; active?: boolean }[] } | { restaurant_id: number; kind: string; active?: boolean }[]>("/api/dashboard/restaurant-benefits/", "all=1"),
  ]);
  const bulkStats = bulk?.stats ?? null;
  const sameDays = bulk?.prev_same_days?.stats ?? null;
  /** 1022 백엔드가 배포됐나 — 새 칸이 한 줄이라도 있으면 그렇다. 안 됐으면 새 칸은 0 이 아니라 「집계 전」(undefined) */
  const hasNewCounts = bulkStats ? Object.values(bulkStats).some((v) => v && "active_users_this_month" in v) : false;
  const benefitList = Array.isArray(benefitsRes) ? benefitsRes : benefitsRes?.benefits ?? null;
  const benefitCount = new Map<number, number>();
  const stampBenefit = new Set<number>();
  for (const b of benefitList ?? []) {
    if (b.active === false) continue;
    benefitCount.set(b.restaurant_id, (benefitCount.get(b.restaurant_id) ?? 0) + 1);
    if (b.kind === "STAMP") stampBenefit.add(b.restaurant_id);
  }
  const prevRows = snap.data?.restaurants ?? null;

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
    campus: campusById.get(r.restaurant_id) ?? null,
    hidden_from_app: r.hidden_from_app === true,
    // 스냅샷에 줄이 없는 매장은 그 달 활동이 0 이다(백엔드가 그 달에 아무 일도 없던 매장의 행을 지운다)
    prev: prevRows
      ? { coupon_redeemed: prevRows[String(r.restaurant_id)]?.coupon_redeemed ?? 0, stamp_earned: prevRows[String(r.restaurant_id)]?.stamp_earned ?? 0 }
      : null,
    prev_same: sameDays ? { coupon_redeemed: sameDays[String(r.restaurant_id)]?.coupon_redeemed ?? 0, stamp_earned: sameDays[String(r.restaurant_id)]?.stamp_earned ?? 0, voucher_redeemed: sameDays[String(r.restaurant_id)]?.voucher_redeemed ?? 0 } : null,
    coupon_users: hasNewCounts && stats ? stats.coupon_users_this_month ?? 0 : null,
    active_users: hasNewCounts && stats ? stats.active_users_this_month ?? 0 : null,
    voucher_redeemed: hasNewCounts && stats ? stats.voucher_redeemed_this_month ?? 0 : null,
    mileage_earners: hasNewCounts && stats ? stats.mileage_earners_this_month ?? 0 : null,
    benefit_count: benefitList ? benefitCount.get(r.restaurant_id) ?? 0 : null,
    has_stamp_benefit: benefitList ? stampBenefit.has(r.restaurant_id) : null,
  });

  const stores: StoreMetric[] = restaurants.map((r) => toMetric(r, bulkStats ? bulkStats[String(r.restaurant_id)] ?? {} : null));

  // 화면이 캠퍼스별로 다시 셀 때도 같은 함수를 쓴다 (storeMetrics.ts)
  const totals = summarizeStoreMetrics(stores);

  const body = {
    stores,
    totals,
    generated_at: new Date().toISOString(),
    stores_unreadable: storesUnreadable,
    test_excluded: testExcluded,
    // 백엔드가 안전 상한에서 목록을 잘랐다(백엔드 #126~) — 뒤쪽 매장이 없다
    stores_truncated: Boolean(backend?.truncated),
    // 지난달 줄의 출처 — ok 면 언제 굳힌 값인지, missing 이면 그 달 스냅샷이 아직 없다, unreadable 이면 못 읽음
    /** 지난달 같은 날짜까지 — 백엔드가 줬나 */
    previous_same: sameDays ? { available: true } : { available: false },
    previous: prevRows
      ? { period: prevPeriod, state: "ok", complete: Boolean(snap.data?.current?.complete), counted_at: snap.data?.current?.counted_at ?? null }
      : { period: prevPeriod, state: snap.status === 404 ? "missing" : "unreadable" },
    source: backend ? "backend" : isPreview() ? "preview-snapshot" : "unavailable",
    draft: false,
  };
  cached = { at: Date.now(), body };
  return body;
});
