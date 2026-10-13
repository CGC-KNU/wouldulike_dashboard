import type { BackendRestaurant, Lead, QualityIssue, QualitySeverity, StoreOps } from "./types";
import { withoutTestStores } from "./storeMetrics";

/**
 * 데이터 정합성 규칙 — `/api/probe/quality` 가 읽어 온 것을 받아 어긋난 곳을 센다.
 * 읽기(백엔드 호출)는 라우트가 하고, 여기는 판정만 한다 — 그래야 규칙을 테스트로 묶을 수 있다.
 *
 * 1013: 운영 기록·입점 후보를 9/3 초안 시드에서 읽고 있었다. Astro 화면은 9월 중순부터 백엔드가 원본인데
 * 이 라우트만 안 바뀌어서, 입금이 끝난 매장이 「입금 확인 안 됨」으로 남고 입점 후보 규칙은 한 번도 안 떴다.
 * 이제 `ops`·`leads` 가 null(못 읽음)이면 그 규칙들은 **침묵한다** — 시드로 대신 판정하지 않는다.
 */

export interface Benefit {
  id: number;
  restaurant_id: number;
  kind: string;
  active: boolean;
  title: string;
}

export interface FeaturedCampaign {
  id: number;
  restaurant_id?: number | null;
  restaurant_name?: string | null;
  is_active?: boolean;
  title?: string;
}

export interface QualityInput {
  restaurants: BackendRestaurant[];
  benefits: Benefit[];
  featured: FeaturedCampaign[];
  /** Astro 운영 기록(입금·비치물·학기·캠퍼스). null = 못 읽음 */
  ops: StoreOps[] | null;
  /** Astro 입점 후보. null = 못 읽음 */
  leads: Lead[] | null;
  now?: number;
}

export interface QualityResult {
  issues: QualityIssue[];
  counts: Record<QualitySeverity, number>;
  /** 점검에서 뺀 테스트 매장 수 — 매장 지표·Astro 파트너 매장과 같은 기준 */
  test_excluded: number;
}

const DAY = 86_400_000;

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / DAY);
}

export function checkQuality({ restaurants: all, benefits, featured, ops: opsList, leads, now = Date.now() }: QualityInput): QualityResult {
  const { rows: restaurants, excluded } = withoutTestStores(all, opsList ?? []);
  const opsById = new Map((opsList ?? []).map((o) => [o.id, o]));

  const benefitCount = new Map<number, number>();
  for (const b of benefits) {
    if (b.active === false) continue;
    benefitCount.set(b.restaurant_id, (benefitCount.get(b.restaurant_id) ?? 0) + 1);
  }

  const issues: QualityIssue[] = [];
  // id 는 이름이 아니라 레코드 키로 — 같은 상호가 두 상권에 있으면 이름은 겹친다
  const push = (i: Omit<QualityIssue, "id">, key: string | number) =>
    issues.push({ ...i, id: `${i.rule}:${key}` });

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
          hint: "Papillon → 배너/팝업에서 해당 기획전을 내리거나 매장을 교체하세요.",
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

    // ④ 유료인데 입금이 확인되지 않았다 — 우리 쪽이 잡고 있는 일. 운영 기록을 못 읽었으면 판정하지 않는다
    if (paid && affiliate && opsList) {
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

    // ⑦ 앱 대학가가 비었다 — 앱은 이 칸으로 매장을 거르므로 대학가를 고른 학생에게 이 매장이 안 보인다(1009 에 실제로 있었다).
    //    Astro 캠퍼스와 맞추는 일(campus_sync)은 실패해도 조용히 넘어가서, 이 규칙이 그물이다.
    //    응답에 campus 칸이 없는(옛 백엔드·미리보기) 매장은 판정하지 않는다.
    const appCampus = typeof r.campus === "string" ? r.campus.trim() : null;
    if (affiliate && r.hidden_from_app !== true && appCampus === "") {
      push({
        severity: "high",
        rule: "APP_CAMPUS_MISSING",
        title: "제휴 매장인데 앱 대학가가 비어 있습니다",
        subject: r.name,
        detail: ops?.campus
          ? `앱은 대학가로 매장을 거릅니다 — 대학가를 고른 학생에게 이 매장이 안 보입니다. Astro 에는 ${ops.campus}(으)로 적혀 있습니다.`
          : "앱은 대학가로 매장을 거릅니다 — 대학가를 고른 학생에게 이 매장이 안 보입니다. Astro 캠퍼스도 비어 있습니다.",
        hint: ops?.campus
          ? "백엔드 `python manage.py sync_store_campus --apply` 가 Astro 값으로 채웁니다(한쪽만 빈 매장만 건드림)."
          : "Astro → 파트너 매장 → 매장 상세에서 캠퍼스를 고르면 앱 대학가도 같이 바뀝니다.",
        source: "restaurants_affiliate.campus",
      }, r.restaurant_id);
    }

    // ⑧ Astro 캠퍼스와 앱 대학가가 다르다 — 숫자(Astro·Probe)와 노출(앱)이 서로 다른 대학가를 본다
    if (affiliate && ops?.campus && appCampus && ops.campus !== appCampus) {
      push({
        severity: "medium",
        rule: "CAMPUS_MISMATCH",
        title: "Astro 캠퍼스와 앱 대학가가 다릅니다",
        subject: r.name,
        detail: `Astro 는 ${ops.campus}, 앱은 ${appCampus} 입니다. 매장 지표는 Astro 쪽으로 세고, 학생에게는 앱 쪽 대학가에서 보입니다.`,
        hint: "어느 쪽이 맞는지 확인한 뒤 Astro → 매장 상세에서 캠퍼스를 고치세요(바꾸면 앱도 같이 바뀝니다). 둘 다 값이 있으면 sync_store_campus 는 건드리지 않습니다.",
        source: "astro_store_ops.campus × restaurants_affiliate.campus",
      }, r.restaurant_id);
    }
  }

  // ⑥ 방치된 컨택 — Pitchr 대시보드의 "7일+ 무응답"을 그대로 가져왔다
  for (const l of leads ?? []) {
    if (l.stage === "거절" || l.stage === "보류" || l.stage === "계약 완료") continue;
    const idle = daysSince(l.last_touch_at, now);
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

  return {
    issues,
    counts: {
      high: issues.filter((i) => i.severity === "high").length,
      medium: issues.filter((i) => i.severity === "medium").length,
      low: issues.filter((i) => i.severity === "low").length,
    },
    test_excluded: excluded,
  };
}
