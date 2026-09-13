import { NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import { fetchPapillonMonths, fetchPerformance, mentions } from "@/lib/draft/papillon";
import { readDraft } from "@/lib/draft/store";
import { metricsOf } from "@/lib/draft/snapshot";
import { buildReportText, cohortNote } from "@/lib/draft/report";
import type { BackendRestaurant, ReportMetric, StoreReport } from "@/lib/draft/types";
import type { PostPerformance } from "@/app/dashboard/admin/satellite/types";

/**
 * Probe · 매장 리포트의 "Papillon 에서 온 게시물" 목록.
 *
 * 민열님 0906(#random, 민찬 cc) + 0913: 마케팅(Papillon)이 올린 게시물에 제휴 매장이 들어 있으면 자동으로 여기 잡히고,
 * **시기와 상관없이** 원할 때 리포트를 만든다. D+7 · D+14 는 권장 시점(목표)이지 게이트가 아니다.
 * (0913: 홍보 인사이트 화면과 매장 리포트 화면을 하나로 합쳤다 — 화면은 `probe/Reports.tsx`.)
 *
 * 0911 토론 반영: 중앙값을 "평균"이라 부르지 않고, 표본(n<5·hidden)이 작으면 비교하지 않고, 근거가 없으면 그 자리를
 * 다른 주장으로 메우지 않는다. 헤드라인은 저장→도달→조회 고정. 여러 매장이 함께 나온 게시물은 문장이 그렇다고 말한다.
 * 앱 지표는 같은 기간에 일어난 일로 병렬 서술한다. 리포트(공개 링크)를 이미 보냈으면 그 사실도 같이 준다.
 */

export interface StoreInsight {
  restaurant_id: number;
  store: string;
  plan_id: number;
  topic: string;
  posted_at: string | null;
  permalink: string | null;
  age_days: number | null;
  co_stores: number;
  checkpoint: "D2" | "D7" | "D14" | "done" | "waiting";
  /** 권장 시점 도달 여부 — 게이트가 아니라 표시용 */
  targets: { d7: boolean; d14: boolean };
  /** 리포트 만들 때: 수치가 있고 D+7 을 지났는데 살아 있는 리포트가 없음 */
  due: boolean;
  available: boolean;
  reason?: string;
  metrics: ReportMetric[];
  cohort_note: string | null;
  report: string | null;
  sent_report: { id: string; status: string; sent_at: string | null; views: number } | null;
}

interface StatsEnvelope { stats?: { revisit_this_month?: number; loyal_total?: number; coupon_redeemed_this_month?: number; stamp_earned_this_month?: number } }

function checkpointOf(age: number | null): StoreInsight["checkpoint"] {
  if (age === null || age < 2) return "waiting";
  if (age < 7) return "D2";
  if (age < 14) return "D7";
  if (age < 21) return "D14";
  return "done";
}

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;

  const backend = await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/");
  const restaurants = (backend?.restaurants ?? (isPreview() ? previewRestaurants() : [])).filter((r) => r.is_affiliate !== false);
  const pap = await fetchPapillonMonths(2);

  if (!pap.reachable) {
    return NextResponse.json({ insights: [] as StoreInsight[], papillon_reachable: false, checked: { stores: restaurants.length, plans: 0 }, generated_at: new Date().toISOString(), draft: true, draft_note: "Papillon 기획 목록을 읽지 못했습니다. 비어 있어도 '홍보한 적 없음'이 아닙니다." });
  }

  const matched: { r: BackendRestaurant; plan: (typeof pap.plans)[number] }[] = [];
  for (const plan of pap.plans) {
    if (plan.status !== "published") continue;
    for (const r of restaurants) if (mentions(plan.topic, r.name)) matched.push({ r, plan });
  }
  const coStores = new Map<number, number>();
  for (const { plan } of matched) coStores.set(plan.id, (coStores.get(plan.id) ?? 0) + 1);

  const uniquePlans = [...new Map(matched.map((m) => [m.plan.id, m.plan])).values()].slice(0, 30);
  const perf = new Map<number, PostPerformance | null>();
  await Promise.all(uniquePlans.map(async (p) => perf.set(p.id, await fetchPerformance(p.id))));
  // 앱 지표는 매장마다 한 번 (게시물 수와 무관)
  const stats = new Map<number, StatsEnvelope["stats"] | null>();
  await Promise.all([...new Set(matched.map((m) => m.r.restaurant_id))].map(async (id) => stats.set(id, (await fetchBackendJson<StatsEnvelope>("/api/dashboard/stats/", `restaurant_id=${id}`))?.stats ?? null)));
  const reports = readDraft<StoreReport[]>("probe_reports", () => []);
  const month = new Date().toISOString().slice(0, 7);

  const insights: StoreInsight[] = matched.map(({ r, plan }) => {
    const p = perf.get(plan.id) ?? null;
    const metrics = metricsOf(p);
    const st = stats.get(r.restaurant_id) ?? null;
    const age = p?.age_days ?? null;
    const cp = checkpointOf(age);
    const snapshot = {
      store: { name: r.name, campus: null },
      post: { plan_id: plan.id, topic: plan.topic, posted_at: p?.post?.posted_at ?? null, permalink: p?.post?.permalink ?? null, format: p?.post?.format ?? null, caption: null, cover_url: null, owner_name: plan.owner_name, co_stores: coStores.get(plan.id) ?? 1 },
      as_of: new Date().toISOString(), basis: p?.basis ?? null, age_days: age, collecting: Boolean(p?.collecting), metrics, cohort_note: cohortNote(metrics),
      app: st ? { month, coupon_redeemed: st.coupon_redeemed_this_month ?? 0, stamp_earned: st.stamp_earned_this_month ?? 0, revisit: st.revisit_this_month ?? 0, loyal_total: st.loyal_total ?? 0 } : null,
    };
    const sent = reports.find((x) => x.plan_id === plan.id && x.restaurant_id === r.restaurant_id && x.status !== "REVOKED") ?? null;
    return {
      restaurant_id: r.restaurant_id, store: r.name, plan_id: plan.id, topic: plan.topic,
      posted_at: snapshot.post.posted_at, permalink: snapshot.post.permalink, age_days: age, co_stores: snapshot.post.co_stores, checkpoint: cp,
      targets: { d7: age !== null && age >= 7, d14: age !== null && age >= 14 },
      due: Boolean(p?.available) && age !== null && age >= 7 && !sent,
      available: Boolean(p?.available), reason: p?.reason, metrics, cohort_note: snapshot.cohort_note,
      report: p?.available ? buildReportText(snapshot, cp) : null,
      sent_report: sent && { id: sent.id, status: sent.status, sent_at: sent.sent_at, views: sent.views.count },
    };
  });
  insights.sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""));

  return NextResponse.json({ insights, papillon_reachable: true, checked: { stores: restaurants.length, plans: pap.plans.length }, generated_at: new Date().toISOString(), draft: false });
}
