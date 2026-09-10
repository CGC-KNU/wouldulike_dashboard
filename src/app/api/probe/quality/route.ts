import { NextResponse } from "next/server";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { readDraft } from "@/lib/draft/store";
import { seedLeads, seedStoreOps } from "@/lib/draft/seed";
import type { BackendRestaurant, Lead, QualityIssue, StoreOps } from "@/lib/draft/types";
import { requireTool } from "@/lib/draft/guard";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";

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
 */

interface Benefit {
  id: number;
  restaurant_id: number;
  kind: string;
  active: boolean;
  title: string;
}
interface FeaturedCampaign {
  id: number;
  restaurant_id?: number | null;
  restaurant_name?: string | null;
  is_active?: boolean;
  title?: string;
}

const DAY = 86_400_000;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY);
}

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const [restaurantsRes, benefitsRes, featuredRes] = await Promise.all([
    fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/"),
    fetchBackendJson<Benefit[] | { benefits?: Benefit[] }>("/api/dashboard/restaurant-benefits/"),
    fetchBackendJson<FeaturedCampaign[] | { results?: FeaturedCampaign[] }>(
      "/api/dashboard/admin/featured-campaigns/"
    ),
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

  const opsList = readDraft<StoreOps[]>("astro_store_ops", seedStoreOps);
  const opsById = new Map(opsList.map((o) => [o.id, o]));
  const leads = readDraft<Lead[]>("astro_leads", seedLeads);

  const benefitCount = new Map<number, number>();
  for (const b of benefits) {
    if (b.active === false) continue;
    benefitCount.set(b.restaurant_id, (benefitCount.get(b.restaurant_id) ?? 0) + 1);
  }

  const issues: QualityIssue[] = [];
  // id 는 이름이 아니라 레코드 키로 — 같은 상호가 두 상권에 있으면 이름은 겹친다
  const push = (i: Omit<QualityIssue, "id">, key: string | number) =>
    issues.push({ ...i, id: `${i.rule}:${key}` });

  const backendReachable = restaurantsOk || isPreview();

  for (const r of restaurants) {
    const paid = r.tier === "BOOST" || r.tier === "CONTENT";
    const affiliate = r.is_affiliate !== false;
    const ops = opsById.get(r.restaurant_id);

    // ① 앱에 노출되는데 플랜이 없다 — 어떤 혜택을 줘야 하는지 시스템이 모른다
    if (affiliate && !r.tier) {
      push({
        severity: "medium",
        rule: "TIER_MISSING",
        title: "제휴 매장인데 플랜이 지정되지 않았습니다",
        subject: r.name,
        detail: "앱에는 노출되지만 FREE/BOOST/CONTENT 중 어느 것도 지정돼 있지 않습니다.",
        hint: "Astro → 매장 상세 → 플랜에서 지정하세요. 슬랙 메시징의 '유료 식당' 판정도 이 값을 씁니다.",
        source: "restaurants.tier",
      }, r.restaurant_id);
    }

    // ② 돈은 받는데 앱에서 줄 게 없다 — 가장 아픈 종류의 불일치
    if (paid && affiliate && (benefitCount.get(r.restaurant_id) ?? 0) === 0 && benefits.length > 0) {
      push({
        severity: "high",
        rule: "PAID_NO_BENEFIT",
        title: "유료 매장인데 등록된 혜택이 0건입니다",
        subject: r.name,
        detail: `플랜 ${r.tier} 인데 활성 쿠폰·스탬프 혜택이 하나도 없습니다. 앱 사용자에게는 빈 매장으로 보입니다.`,
        hint: "Astro → 혜택 조회 → 관리하기에서 일반/한정 쿠폰을 등록하세요.",
        source: "restaurants.tier × restaurant_benefits",
      }, r.restaurant_id);
    }

    // ③ 제휴가 끝났는데 앱 어딘가에 아직 살아 있다 (하카타 파스타 케이스)
    if (!affiliate) {
      const stillFeatured = featured.some(
        (f) =>
          f.is_active !== false &&
          (f.restaurant_id === r.restaurant_id || f.restaurant_name === r.name)
      );
      if (stillFeatured) {
        push({
          severity: "high",
          rule: "INACTIVE_STILL_EXPOSED",
          title: "비활성 매장이 아직 기획전·배너에 걸려 있습니다",
          subject: r.name,
          detail: "제휴가 끝난 매장인데 활성 기획전 캠페인에 남아 있습니다. 앱에서 누르면 갈 곳이 없습니다.",
          hint: "Aether → 배너 & 팝업에서 해당 기획전을 내리거나 매장을 교체하세요.",
          source: "restaurants.is_affiliate × featured_campaigns",
        }, r.restaurant_id);
      }
      if ((benefitCount.get(r.restaurant_id) ?? 0) > 0) {
        push({
          severity: "medium",
          rule: "INACTIVE_HAS_BENEFIT",
          title: "비활성 매장에 활성 혜택이 남아 있습니다",
          subject: r.name,
          detail: "제휴가 끝났는데 쿠폰·스탬프 혜택이 아직 활성 상태입니다.",
          hint: "혜택을 비활성 처리하거나 매장을 다시 활성화하세요.",
          source: "restaurants.is_affiliate × restaurant_benefits",
        }, r.restaurant_id);
      }
    }

    // ④ 유료인데 입금이 확인되지 않았다 — 우리 쪽이 잡고 있는 일
    if (paid && affiliate) {
      if (!ops) {
        push({
          severity: "medium",
          rule: "OPS_ROW_MISSING",
          title: "유료 매장인데 영업 운영 기록이 없습니다",
          subject: r.name,
          detail: "입금·계약서·비치물 상태를 아무도 기록하지 않았습니다.",
          hint: "Astro → 매장 상세 → 이행 블록에서 첫 값을 넣으면 행이 생깁니다.",
          source: "astro_store_ops",
        }, r.restaurant_id);
      } else if (ops.billing !== "PAID" && ops.billing !== "EXEMPT") {
        push({
          severity: ops.invoice === "NO_REPLY" ? "high" : "medium",
          rule: "PAID_TIER_UNSETTLED",
          title: "유료 매장의 입금이 확인되지 않았습니다",
          subject: r.name,
          detail:
            ops.invoice === "NO_REPLY"
              ? "세금계산서를 보냈는데 회신이 없습니다."
              : "입금 상태가 아직 '대기' 또는 '미확인'입니다.",
          hint: "통장을 확인한 뒤 Astro → 입금 현황에서 체크하세요. 체크한 사람과 시각이 함께 남습니다.",
          source: "restaurants.tier × astro_store_ops.billing",
        }, r.restaurant_id);
      } else if (ops.billing === "PAID" && !ops.kit_delivered) {
        push({
          severity: "low",
          rule: "PAID_NO_KIT",
          title: "입금은 됐는데 비치물이 전달되지 않았습니다",
          subject: r.name,
          detail: "포스터·QR 스티커 전달이 체크되지 않았습니다.",
          hint: "전달했다면 Astro → 매장 상세 → 운영에서 체크하세요.",
          source: "astro_store_ops.kit_delivered",
        }, r.restaurant_id);
      }
    }

    // ⑤ 학기/방학 활성 여부가 아직 아무도 정하지 않은 채로 남아 있다
    if (paid && affiliate && ops && ops.semester_active === null && ops.vacation_active === null) {
      push({
        severity: "low",
        rule: "SEASON_UNSET",
        title: "학기/방학 운영 구분이 비어 있습니다",
        subject: r.name,
        detail: "2026-08-12 에 '기획팀이 확인해서 수동 설정'으로 정해졌지만 아직 값이 없습니다.",
        hint: "방학 전에 점주에게 확인해서 Astro → 매장 상세 → 운영에 넣으세요.",
        source: "astro_store_ops.semester_active",
      }, r.restaurant_id);
    }
  }

  // ⑥ 방치된 컨택 — Pitchr 대시보드의 "7일+ 무응답"을 그대로 가져왔다
  for (const l of leads) {
    if (l.stage === "거절" || l.stage === "입점완료") continue;
    const idle = daysSince(l.last_touch_at);
    if (idle !== null && idle >= 7) {
      push({
        severity: idle >= 14 ? "high" : "medium",
        rule: "LEAD_STALE",
        title: `${idle}일째 움직이지 않은 컨택`,
        subject: l.name,
        detail: `단계 '${l.stage}' 에서 ${idle}일간 아무 기록이 없습니다.`,
        hint: "다시 연락하거나, 가망이 없으면 '거절'로 옮기세요. 보드에 남아 있는 것만으로 숫자가 부풀어 보입니다.",
        source: "astro_leads.last_touch_at",
      }, l.id);
    }
  }

  const order = { high: 0, medium: 1, low: 2 } as const;
  issues.sort((a, b) => order[a.severity] - order[b.severity] || a.subject.localeCompare(b.subject, "ko"));

  return NextResponse.json({
    issues,
    counts: {
      high: issues.filter((i) => i.severity === "high").length,
      medium: issues.filter((i) => i.severity === "medium").length,
      low: issues.filter((i) => i.severity === "low").length,
    },
    checked: {
      restaurants: restaurants.length,
      benefits: benefits.length,
      featured: featured.length,
      leads: leads.length,
    },
    /** 백엔드를 못 읽으면 규칙 대부분이 침묵한다. "이상 없음"과 구별해야 한다. */
    backend_reachable: backendReachable,
    generated_at: new Date().toISOString(),
    draft: true,
    draft_note: "운영 필드(입금·비치물·학기)는 초안 저장소 기준입니다.",
  });
}
