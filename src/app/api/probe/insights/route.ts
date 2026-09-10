import { NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import { fetchPapillonMonths, fetchPerformance, mentions } from "@/lib/draft/papillon";
import type { BackendRestaurant } from "@/lib/draft/types";
import type { PostPerformance } from "@/app/dashboard/admin/satellite/types";

/**
 * Probe · 제휴매장 홍보 인사이트.
 *
 * 민열님 0906(#random, 민찬 cc): 인스타에 홍보물이 올라갈 때마다 (1) 제휴 매장이 들어 있는지 보고 (2) 들어 있으면
 * 그때부터 7일·14일 단위로 인사이트를 추적하고 (3) 주기마다 세일즈 담당을 태그해 사장님께 보낼 보고글을 만든다.
 * 보고글 양식은 라라더 건(9/4 '대구 면 요리 맛집' 큐레이션 · 저장 309회 · 평균 대비 +29%)을 따랐다.
 *
 * 여기서는 Papillon 의 게시물 성과(`/plans/{id}/performance`)를 **매장 이름 매칭**으로 묶는다.
 * 성과 API 가 코호트 중앙값(cohort.median)을 같이 주므로 "평균 대비 몇 %" 를 계산할 수 있다.
 * 숫자를 지어내지 않는다 — 성과가 아직 없으면(available:false) 그 사실을 그대로 보낸다.
 */

export interface StoreInsight {
  restaurant_id: number;
  store: string;
  plan_id: number;
  topic: string;
  posted_at: string | null;
  permalink: string | null;
  age_days: number | null;
  /** 다음 보고 시점: D+2 → D+7 → D+14 → 종료 */
  checkpoint: "D2" | "D7" | "D14" | "done" | "waiting";
  available: boolean;
  reason?: string;
  metrics: { key: string; value: number; median: number | null; delta_pct: number | null }[];
  report: string | null;
}

const KEYS = ["saved", "reach", "views", "shares", "likes", "comments", "profile_visits", "follows"];
const LABEL: Record<string, string> = { saved: "저장", reach: "도달", views: "조회", shares: "공유", likes: "좋아요", comments: "댓글", profile_visits: "프로필 방문", follows: "팔로우 전환" };

function checkpointOf(age: number | null): StoreInsight["checkpoint"] {
  if (age === null) return "waiting";
  if (age < 2) return "waiting";
  if (age < 7) return "D2";
  if (age < 14) return "D7";
  if (age < 21) return "D14";
  return "done";
}

/** 사장님 보고글. 라라더 건 문장 구조 그대로 — 인사말 · 어떤 게시물 · 가장 눈에 띄는 지표 · 해석 · 나머지 한 줄. */
function buildReport(store: string, topic: string, postedAt: string | null, metrics: StoreInsight["metrics"], age: number | null): string | null {
  if (!metrics.length) return null;
  const date = postedAt ? new Date(postedAt) : null;
  const when = date ? `${date.getMonth() + 1}/${date.getDate()}` : "최근";
  const lead = [...metrics].filter((m) => m.delta_pct !== null).sort((a, b) => (b.delta_pct ?? 0) - (a.delta_pct ?? 0))[0] ?? metrics[0];
  const rest = metrics.filter((m) => m !== lead).slice(0, 3);
  const pct = (m: StoreInsight["metrics"][number]) => (m.delta_pct === null ? "" : m.delta_pct >= 0 ? ` 저희 최근 게시물 평균보다 ${m.delta_pct}% 높게 나왔습니다.` : ` 저희 최근 게시물 평균보다 ${Math.abs(m.delta_pct)}% 낮았습니다.`);
  const why: Record<string, string> = {
    saved: "저장은 '나중에 가봐야지' 하고 담아두는 행동이라, 맛집 콘텐츠에서는 방문 의향에 가장 가까운 신호로 보고 있습니다.",
    reach: "도달은 게시물을 한 번이라도 본 계정 수입니다. 팔로워 밖으로 얼마나 퍼졌는지를 봅니다.",
    views: "조회는 게시물이 화면에 펼쳐진 횟수입니다.",
    shares: "공유는 친구에게 '여기 가자' 하고 보낸 횟수라, 저장 다음으로 방문에 가까운 신호입니다.",
    profile_visits: "프로필 방문은 게시물을 보고 저희 계정까지 들어온 수입니다.",
  };
  return [
    `사장님, 안녕하세요. 우주라이크입니다.`,
    ``,
    `지난 ${when} 저희 인스타그램 '${topic}' 게시물에 ${store}를 소개해 드렸습니다. ${age !== null ? `${age}일이 지나 ` : ""}성과가 어느 정도 모여서 정리해 보내드립니다.`,
    ``,
    `가장 눈에 띄는 것은 ${LABEL[lead.key] ?? lead.key}입니다.`,
    `${lead.value.toLocaleString()}회로,${pct(lead) || " 저희 게시물 중 상위권입니다."}`,
    why[lead.key] ?? "",
    ``,
    rest.length ? rest.map((m) => `${LABEL[m.key] ?? m.key} ${m.value.toLocaleString()}${m.delta_pct !== null ? ` (평균 대비 ${m.delta_pct >= 0 ? "+" : ""}${m.delta_pct}%)` : ""}`).join(" · ") : "",
    ``,
    `다음 주에 한 번 더 정리해서 보내드리겠습니다. 감사합니다.`,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;

  const backend = await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/");
  const restaurants = (backend?.restaurants ?? (isPreview() ? previewRestaurants() : [])).filter((r) => r.is_affiliate !== false);
  const pap = await fetchPapillonMonths(2);

  if (!pap.reachable) {
    return NextResponse.json({
      insights: [] as StoreInsight[],
      papillon_reachable: false,
      checked: { stores: restaurants.length, plans: 0 },
      generated_at: new Date().toISOString(),
      draft: true,
      draft_note: "Papillon 기획 목록을 읽지 못했습니다. 비어 있어도 '홍보한 적 없음'이 아닙니다.",
    });
  }

  // 게시 완료된 기획 중 제휴 매장 이름이 들어간 것만
  const matched: { r: BackendRestaurant; plan: (typeof pap.plans)[number] }[] = [];
  for (const plan of pap.plans) {
    if (plan.status !== "published") continue;
    for (const r of restaurants) if (mentions(plan.topic, r.name)) matched.push({ r, plan });
  }

  const insights: StoreInsight[] = [];
  // 성과 API 는 기획마다 한 번. 너무 많으면 최근 30건까지만.
  const uniquePlans = [...new Map(matched.map((m) => [m.plan.id, m.plan])).values()].slice(0, 30);
  const perf = new Map<number, PostPerformance | null>();
  await Promise.all(uniquePlans.map(async (p) => perf.set(p.id, await fetchPerformance(p.id))));

  for (const { r, plan } of matched) {
    const p = perf.get(plan.id) ?? null;
    const age = p?.age_days ?? null;
    const metrics: StoreInsight["metrics"] = p?.available && p.metrics
      ? KEYS.filter((k) => p.metrics![k]).map((k) => {
          const m = p.metrics![k];
          const median = m.cohort?.median ?? null;
          return { key: k, value: m.value, median, delta_pct: median ? Math.round(((m.value - median) / median) * 100) : null };
        })
      : [];
    insights.push({
      restaurant_id: r.restaurant_id,
      store: r.name,
      plan_id: plan.id,
      topic: plan.topic,
      posted_at: p?.post?.posted_at ?? null,
      permalink: p?.post?.permalink ?? null,
      age_days: age,
      checkpoint: checkpointOf(age),
      available: Boolean(p?.available),
      reason: p?.reason,
      metrics,
      report: buildReport(r.name, plan.topic, p?.post?.posted_at ?? null, metrics, age),
    });
  }
  insights.sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""));

  return NextResponse.json({
    insights,
    papillon_reachable: true,
    checked: { stores: restaurants.length, plans: pap.plans.length },
    generated_at: new Date().toISOString(),
    draft: false,
  });
}
