import type { Activity, CastorExperiment, CastorGraph, Lead, StoreOps } from "./types";

/**
 * 초안 시드.
 *
 * ⚠️ 규칙: **지어낸 값을 넣지 않는다.** 여기 들어간 값은 전부 출처가 있다 —
 * 2026-09-03 주준영님의 입금/계산서 보고, 09-04·09-07·09-09 후속 보고, 09-07 사업자번호 공유.
 * 출처가 없는 칸은 `null`(모름)로 둔다. 0 과 null 을 섞으면 화면이 거짓말을 한다.
 * 사업자번호·연락처 같은 식별 정보는 소스에 넣지 않는다 — 번들과 깃 히스토리에 남는다.
 *
 * 학기/방학 활성값이 전부 null 인 것도 의도다 — 2026-08-12 에 "기획팀이 확인해서 수동 입력"으로
 * 정해졌고 아직 아무도 확인하지 않았다. 툴이 추측해서 채우면 영업이 그 값을 못 믿게 된다.
 */

const OPS_SOURCE = "2026-09-03 주준영 보고 + 09-04·09-07·09-09 후속";

function ops(
  id: number,
  patch: Partial<StoreOps> = {}
): StoreOps {
  return {
    id,
    semester_active: null,
    vacation_active: null,
    billing: "UNKNOWN",
    billing_checked_at: null,
    billing_checked_by: null,
    invoice: "NONE",
    quote_sent_at: null,
    contract_returned_at: null,
    kit_delivered: false,
    owner_name: null,
    owner_phone: null,
    biz_no: null,
    monthly_fee: null,
    pay_cycle: null,
    contract_started_on: null,
    contract_months: null,
    benefit_note: null,
    kit_note: null,
    pin: null,
    sheet_owner: null,
    sheet_synced_at: null,
    is_test: false,
    memo: null,
    updated_at: null,
    updated_by: null,
    ...patch,
  };
}

export function seedStoreOps(): StoreOps[] {
  const paid = (id: number, on: string, extra: Partial<StoreOps> = {}) =>
    ops(id, {
      billing: "PAID",
      billing_checked_at: on,
      billing_checked_by: "주준영",
      invoice: "ISSUED",
      updated_at: on,
      updated_by: "seed",
      memo: OPS_SOURCE,
      ...extra,
    });

  return [
    // 입금 확인 — 09-03 보고 5곳
    paid(146, "2026-09-03"), // 닭동가리 경북대점
    paid(56, "2026-09-03"), // 다이와스시
    paid(285, "2026-09-03"), // 난탄 경대북문점
    paid(317, "2026-09-03"), // 라라더
    paid(143, "2026-09-03"), // 스톡홀름샐러드 정문점
    paid(266, "2026-09-04"), // 북성로 우동 불고기 — 09-04 입금 확인
    paid(233, "2026-09-09"), // 핵밥 경북대점

    // 계산서는 나갔는데 회신이 없다 — 영업이 다시 찔러야 하는 칸
    ops(145, { billing: "PENDING", invoice: "NO_REPLY", memo: OPS_SOURCE }), // 통통주먹구이
    ops(33, { billing: "PENDING", invoice: "NO_REPLY", memo: OPS_SOURCE }), // 구구포차

    // 계산서 발송 예정 — 우리 쪽이 잡고 있는 일
    ops(245, { billing: "PENDING", invoice: "NONE", memo: `${OPS_SOURCE} · 사업자번호는 09-09 카톡` }), // 혜화문식당
    ops(97, { billing: "PENDING", invoice: "NONE", memo: `${OPS_SOURCE} · 세발 20,000+2,000` }), // 정든밤
    ops(319, { billing: "PENDING", invoice: "NONE", memo: OPS_SOURCE }), // 쌈마이닭쌈밥

    // 유료 전환 진행 중
    ops(322, { billing: "PENDING", invoice: "NONE", memo: "09-07 유료 전환 · 사업자번호는 09-09 카톡" }), // 진갈매기
    ops(74, { billing: "PENDING", invoice: "NONE", memo: "09-04 유료 전환 예정" }), // 한끼갈비
  ];
}

/**
 * 신규 컨택은 **의도적으로 비워 둔다.**
 * 시트(`신규_식당_컨택`)에 24곳이 있다고 들었지만 이 세션에서 실물을 못 봤다.
 * 없는 걸 그럴듯하게 채우면 화면은 예뻐지고 데이터는 거짓이 된다.
 * 시트 창구가 붙거나 CSV 를 넣으면 그때 채워진다 (Astro → 신규 컨택 → 가져오기).
 */
export function seedLeads(): Lead[] {
  return [];
}

export function seedActivities(): Activity[] {
  return [];
}

/**
 * Castor 그래프도 비워 둔다 — 이건 사람이 쓰는 게 아니라 `scripts/castor-parse.mjs` 가
 * 코드에서 뽑는 것이다. 파서를 한 번 돌리면 채워진다.
 */
export function seedCastorGraph(): CastorGraph {
  return {
    version: "0",
    source: { repo: "wouldulike_dashboard", commit: "", framework: "next@app-router" },
    generated_at: "",
    screens: [],
    edges: [],
    guards: [],
  };
}

/**
 * 실험은 한 건만 예시로 둔다. 2026-09-10 정아윤님이 실제로 제기한 문제
 * ("가로 배너 없을 때 빈 공간이 뜬다" / "배너에 쿠폰함 딥링크를 넣고 싶다")를
 * 가설 형태로 옮긴 것이라 지어낸 값이 아니다.
 */
export function seedExperiments(): CastorExperiment[] {
  return [
    {
      id: "exp-2609-banner-deeplink",
      hypothesis: "배너를 누르면 쿠폰함으로 바로 보내면, 배너 노출 대비 쿠폰 사용률이 오른다",
      target: { screen: "home", audience: "all" },
      variants: [
        { key: "A", name: "현재 — 매장 상세로 이동", weight: 50, blocks: ["banner", "nearby_list", "stamp_summary"] },
        { key: "B", name: "쿠폰함 딥링크", weight: 50, blocks: ["banner", "nearby_list", "stamp_summary"] },
      ],
      metric: { primary: "배너 노출 → 쿠폰 사용 전환율", guard: ["매장 상세 진입 수", "세션당 체류시간"] },
      period: { from: "2026-09-15", days: 14 },
      status: "draft",
      source: { commit: "" },
      created_by: "민열",
      created_at: "2026-09-10",
    },
  ];
}
