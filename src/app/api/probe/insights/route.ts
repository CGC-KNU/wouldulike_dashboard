import { NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import { fetchPapillonMonths, fetchPerformance, isPartnerContent, mentions, partnerNames } from "@/lib/draft/papillon";
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
 *
 * 어떤 게시물이 잡히는가 (0919):
 *  - 제목 괄호 "(정든밤 포함)" — 마케팅팀 약속(0916). 백엔드 #ops-partner 알림과 같은 규칙이라 슬랙에서
 *    "7일 경과"가 울린 게시물이 여기에도 뜬다. 괄호 안 이름을 매장 표에서 못 찾아도 빼지 않고
 *    「매장 미확인」 줄로 둔다 — 조용히 빠지는 게 제일 나쁘다.
 *  - 괄호가 없던 예전 기획은 전처럼 제목에 매장 이름이 들어 있으면 잡는다.
 *  - 발행 여부는 기획 상태(published) 또는 실제 게시물(성과 API 의 post)로 본다.
 *  - 웹을 거치지 않은 외부 발행(기획 없는 Post)은 아직 못 잡는다 — 백엔드 알림도 같다.
 */

export interface StoreInsight {
  /** null = 괄호에 적힌 매장을 매장 표에서 못 찾음 — 리포트를 만들 수 없다 */
  restaurant_id: number | null;
  store: string;
  matched_by: "marker" | "name";
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

  type Plan = (typeof pap.plans)[number];
  const same = (name: string, r: BackendRestaurant) => mentions(name, r.name) || mentions(r.name, name);
  const candidates: { r: BackendRestaurant | null; label: string; by: StoreInsight["matched_by"]; plan: Plan }[] = [];
  for (const plan of [...pap.plans].sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))) {
    if (plan.status === "draft") continue; // 주제만 적힌 기획 — 올라갈 게 없다
    const marked = isPartnerContent(plan.topic);
    const names = partnerNames(plan.topic);
    const seen = new Set<number>();
    const add = (r: BackendRestaurant, by: StoreInsight["matched_by"]) => { if (!seen.has(r.restaurant_id)) { seen.add(r.restaurant_id); candidates.push({ r, label: r.name, by, plan }); } };
    for (const r of restaurants) if (names.some((n) => same(n, r))) add(r, "marker");
    for (const r of restaurants) if (mentions(plan.topic, r.name)) add(r, marked ? "marker" : "name");
    if (!marked) continue;
    for (const n of names) if (!restaurants.some((r) => same(n, r))) candidates.push({ r: null, label: n, by: "marker", plan });
    if (names.length === 0 && seen.size === 0) candidates.push({ r: null, label: "제휴식당 (괄호에 이름 없음)", by: "marker", plan });
  }

  // 성과는 게시물(기획)마다 한 번. 최근 기획부터 30개까지
  const uniquePlans = [...new Map(candidates.map((m) => [m.plan.id, m.plan])).values()].slice(0, 30);
  const perf = new Map<number, PostPerformance | null>();
  const denied = new Set<number>();
  await Promise.all(uniquePlans.map(async (p) => {
    const r = await fetchPerformance(p.id);
    perf.set(p.id, r.perf);
    if (r.denied) denied.add(p.id);
  }));
  // 올라간 것만 — 기획 상태가 발행완료이거나, 성과 API 가 게시물을 돌려줬거나(리드 수동 발행 등)
  const kept = new Set(uniquePlans.map((p) => p.id));
  const matched = candidates.filter(({ plan }) => kept.has(plan.id) && (plan.status === "published" || Boolean(perf.get(plan.id)?.post)));
  const coStores = new Map<number, number>();
  for (const { plan } of matched) coStores.set(plan.id, (coStores.get(plan.id) ?? 0) + 1);
  // 앱 지표는 전 매장을 한 번에 받는다 (백엔드 #37). 옛 백엔드면 매장마다 한 번씩.
  const stats = new Map<number, StatsEnvelope["stats"] | null>();
  const ids = [...new Set(matched.flatMap((m) => (m.r ? [m.r.restaurant_id] : [])))];
  const bulk = await fetchBackendJson<{ stats?: Record<string, StatsEnvelope["stats"]> }>("/api/dashboard/stats/bulk/");
  if (bulk?.stats) {
    // 집계가 성공했으면 줄이 없는 매장은 활동 0 이다 — 모름이 아니다
    for (const id of ids) stats.set(id, bulk.stats[String(id)] ?? {});
  } else {
    await Promise.all(ids.map(async (id) => stats.set(id, (await fetchBackendJson<StatsEnvelope>("/api/dashboard/stats/", `restaurant_id=${id}`))?.stats ?? null)));
  }
  const reports = readDraft<StoreReport[]>("probe_reports", () => []);
  const month = new Date().toISOString().slice(0, 7);

  const insights: StoreInsight[] = matched.map(({ r, label, by, plan }) => {
    const p = perf.get(plan.id) ?? null;
    const metrics = metricsOf(p);
    const st = r ? stats.get(r.restaurant_id) ?? null : null;
    const rid = r?.restaurant_id ?? null;
    const age = p?.age_days ?? null;
    const cp = checkpointOf(age);
    const snapshot = {
      store: { name: label, campus: null },
      post: { plan_id: plan.id, topic: plan.topic, posted_at: p?.post?.posted_at ?? null, permalink: p?.post?.permalink ?? null, format: p?.post?.format ?? null, caption: null, cover_url: null, owner_name: plan.owner_name, co_stores: coStores.get(plan.id) ?? 1 },
      as_of: new Date().toISOString(), basis: p?.basis ?? null, age_days: age, collecting: Boolean(p?.collecting), metrics, cohort_note: cohortNote(metrics),
      app: st ? { month, coupon_redeemed: st.coupon_redeemed_this_month ?? 0, stamp_earned: st.stamp_earned_this_month ?? 0, revisit: st.revisit_this_month ?? 0, loyal_total: st.loyal_total ?? 0 } : null,
    };
    const sent = rid === null ? null : reports.find((x) => x.plan_id === plan.id && x.restaurant_id === rid && x.status !== "REVOKED") ?? null;
    const reason = rid === null
      ? "괄호에 적힌 매장을 매장 표에서 찾지 못했습니다 — 이름을 매장 표와 맞추면 리포트를 만들 수 있습니다"
      : denied.has(plan.id)
        ? "성과를 볼 권한이 없습니다 — 세틀라이트 리드가 아니면 본인 기획 성과만 보입니다(마케팅팀 확인 중)"
        : p?.reason;
    return {
      restaurant_id: rid, store: label, matched_by: by, plan_id: plan.id, topic: plan.topic,
      posted_at: snapshot.post.posted_at, permalink: snapshot.post.permalink, age_days: age, co_stores: snapshot.post.co_stores, checkpoint: cp,
      targets: { d7: age !== null && age >= 7, d14: age !== null && age >= 14 },
      due: rid !== null && Boolean(p?.available) && age !== null && age >= 7 && !sent,
      available: rid !== null && Boolean(p?.available), reason, metrics, cohort_note: snapshot.cohort_note,
      report: p?.available ? buildReportText(snapshot, cp) : null,
      sent_report: sent && { id: sent.id, status: sent.status, sent_at: sent.sent_at, views: sent.views.count },
    };
  });
  insights.sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""));

  return NextResponse.json({ insights, papillon_reachable: true, checked: { stores: restaurants.length, plans: pap.plans.length, performance_denied: denied.size }, generated_at: new Date().toISOString(), draft: false });
}
