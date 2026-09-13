import { fetchBackendJson } from "./toolProxy";
import { fetchPerformance, mentions } from "./papillon";
import type { ContentPlan, PlanDetail, PostPerformance } from "@/app/dashboard/admin/satellite/types";
import type { BackendRestaurant, ReportMetric, ReportSnapshot } from "./types";
import { MIN_COHORT } from "./report";

/**
 * 스냅샷 만들기 — Papillon 성과 + 기획 상세(커버) + Probe 앱 지표를 **그 순간 값 그대로** 굳힌다.
 * 라이브로 그리지 않는 이유: 공개 페이지엔 인증이 없고, 수치는 계속 변하고, 지어낸 값이 섞일 틈이 생긴다.
 * 못 읽은 값은 필드가 없다(0 이 아니다).
 */

interface StatsEnvelope { stats?: { revisit_this_month?: number; loyal_total?: number; coupon_redeemed_this_month?: number; stamp_earned_this_month?: number } }

export function metricsOf(p: PostPerformance | null): ReportMetric[] {
  if (!p?.available || !p.metrics) return [];
  return Object.entries(p.metrics).map(([key, m]) => {
    const c = m.cohort;
    const median = c?.median ?? null;
    const hidden = Boolean(c?.hidden);
    const n = c?.n ?? 0;
    // 게시물 기준(D7/누적)과 코호트 기준이 다르면 비교가 불공정하다 — 비교하지 않는다 (2라운드 비교 게이트).
    const basisOk = !c?.basis || c.basis === "none" || !p.basis || c.basis === p.basis;
    const ok = !hidden && basisOk && n >= MIN_COHORT && median !== null && median > 0;
    return { key, value: m.value, median, p10: c?.p10 ?? null, p90: c?.p90 ?? null, n, window_days: c?.window_days ?? null, hidden, delta_pct: ok ? Math.round(((m.value - (median as number)) / (median as number)) * 100) : null };
  });
}

export async function buildSnapshot(store: BackendRestaurant & { campus?: ReportSnapshot["store"]["campus"] }, plan: Pick<ContentPlan, "id" | "topic" | "owner_name">, allStores: BackendRestaurant[]): Promise<ReportSnapshot> {
  const [perf, detail, env] = await Promise.all([
    fetchPerformance(plan.id),
    fetchBackendJson<PlanDetail>(`/api/satellite/plans/${plan.id}/detail/`),
    fetchBackendJson<StatsEnvelope>("/api/dashboard/stats/", `restaurant_id=${store.restaurant_id}`),
  ]);
  const cover = detail?.assets?.find((a) => a.kind === "image" && a.is_ready)?.preview_url ?? null;
  const stats = env?.stats ?? null;
  const now = new Date();
  return {
    store: { name: store.name, campus: store.campus ?? null },
    post: {
      plan_id: plan.id, topic: plan.topic,
      posted_at: perf?.post?.posted_at ?? null, permalink: perf?.post?.permalink ?? null, format: perf?.post?.format ?? null,
      caption: detail?.caption ?? perf?.post?.caption ?? null, cover_url: cover, owner_name: plan.owner_name ?? perf?.post?.owner_name ?? null,
      // 같은 게시물에 이름이 들어간 제휴 매장 수 — 1보다 크면 문장이 "함께 소개한 편"이라고 말한다
      co_stores: allStores.filter((s) => mentions(plan.topic, s.name)).length || 1,
    },
    as_of: now.toISOString(),
    basis: perf?.basis ?? null,
    age_days: perf?.age_days ?? null,
    collecting: Boolean(perf?.collecting),
    metrics: metricsOf(perf),
    cohort_note: null,
    app: stats ? { month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, coupon_redeemed: stats.coupon_redeemed_this_month ?? 0, stamp_earned: stats.stamp_earned_this_month ?? 0, revisit: stats.revisit_this_month ?? 0, loyal_total: stats.loyal_total ?? 0 } : null,
  };
}
