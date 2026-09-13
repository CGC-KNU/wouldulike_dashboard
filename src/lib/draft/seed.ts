import type { Activity, CastorExperiment, CastorGraph, IssuerSettings, Lead, SalesDoc, StoreOps, TaxInvoice } from "./types";

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
    campus: null,
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
    billing_start_period: null,
    map_url: null,
    map_name: null,
    contract_months: null,
    district: null,
    contract_signed_on: null,
    contract_ends_on: null,
    coupon_basic: null,
    coupon_limited: null,
    stamp_count: null,
    stamp_reward: null,
    exclusions: null,
    extra_quote: null,
    kit_note: null,
    pin: null,
    contract_original: null,
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

/**
 * 자료실 시드 — 파일은 CGC/01_계약_영업 의 정본이다. 로컬에서는 `public/astro-docs/`(gitignore) 에 복사해 바로 내려받고,
 * 운영은 드라이브/S3 에 올린 링크로 바꾼다. 이 레포는 공개 GitHub 라 계약서 PDF 를 커밋하면 안 된다.
 */
export function seedDocs(): SalesDoc[] {
  const t = "2026-09-10";
  const local = (f: string) => `/astro-docs/${f}`;
  return [
    { id: "doc-contract-v6", kind: "계약서", title: "파트너매장 계약서 26-2 (정본)", version: "v6", url: local("계약서_26_2.pdf"), when: "구두 합의 → 계약 완료", note: "최소 1개월 체험 · 마일리지 추첨형 제8~10조 · 월납. 원본 인도 5만 조항은 v6에서 삭제", updated_at: t, updated_by: "seed" },
    { id: "doc-contract-simple", kind: "계약서", title: "파트너매장 계약서 26-2 (간소화)", version: "0901", url: local("계약서_26_2_간소화.pdf"), when: "구두 합의", note: "매장 안내용. 참조 오류 0901 수정본", updated_at: t, updated_by: "seed" },
    { id: "doc-benefit-form", kind: "계약서", title: "부속서식 · 혜택 등록서", version: "26-2", url: local("부속서식_혜택등록서.pdf"), when: "계약 완료 (혜택 확정)", note: "기본/한정 쿠폰 · 스탬프 혜택을 여기 적어 받는다. 이 값이 계약 세부사항 열로 들어간다", updated_at: t, updated_by: "seed" },
    // 0913: 6P 가 현행 정본이다. 11P 는 랜딩 전용으로 남긴다.
    { id: "doc-proposal-6p-kbu", kind: "제안서", title: "파트너 제안서 6P · 경북대", version: "0912", url: local("제안서_6P_경북대.pdf"), when: "미팅 예정 → 미팅", note: "현행 정본. Boost 월 30,000원(부가세 포함 33,000원) 추천", updated_at: t, updated_by: "seed" },
    { id: "doc-proposal-6p-ynu", kind: "제안서", title: "파트너 제안서 6P · 영남대", version: "0912", url: local("제안서_6P_영남대.pdf"), when: "미팅 예정 → 미팅", note: "Boost 월 45,000원(부가세 포함 49,500원). 신규 상권 문구", updated_at: t, updated_by: "seed" },
    { id: "doc-proposal-6p-kmu", kind: "제안서", title: "파트너 제안서 6P · 계명대", version: "0912", url: local("제안서_6P_계명대.pdf"), when: "미팅 예정 → 미팅", note: "Boost 월 45,000원(부가세 포함 49,500원). 신규 상권 문구", updated_at: t, updated_by: "seed" },
    { id: "doc-proposal-11p", kind: "제안서", title: "파트너 제안서 11P (구본)", version: "0811", url: local("제안서_11P.pdf"), when: "미팅 예정 → 미팅", note: "랜딩(wouldulike-partner.netlify.app) 전용. 미팅에는 6P 를 쓴다", updated_at: t, updated_by: "seed" },
    { id: "doc-proposal-new", kind: "제안서", title: "신규 매장 제안서", version: "26-2", url: local("신규매장_제안서.pdf"), when: "컨택 → 미팅 조율", note: "첫 방문 뒤 카톡으로 보내는 요약본", updated_at: t, updated_by: "seed" },
    { id: "doc-quote-boost", kind: "견적서", title: "공용 견적서 · Boost", version: "0901", url: local("견적서_공용_Boost.pdf"), when: "구두 합의", note: "월납/일시납 병기. 매장별 견적서는 0830_매장별_견적서 스크립트로 재생성", updated_at: t, updated_by: "seed" },
    { id: "doc-quote-form", kind: "견적서", title: "견적서 양식 (편집용)", version: "26-2", url: local("견적서_양식_26_2.docx"), when: "구두 합의", note: "docx. 매장명·금액만 바꿔 쓴다", updated_at: t, updated_by: "seed" },
    { id: "doc-payment-guide", kind: "안내문", title: "점주용 안내문 26-2", version: "최종", url: local("점주용_안내문_26_2.pdf"), when: "계약 완료 → 입금 확인", note: "무료 매장은 안내문만, 유료는 세금계산서 + 안내문 (08-30)", updated_at: t, updated_by: "seed" },
    { id: "doc-flyer", kind: "전단", title: "방문 영업 전단", version: "0812", url: local("방문영업_전단.pdf"), when: "미컨택 → 컨택 (첫 방문)", note: "가격 없음. 북극성 톤", updated_at: t, updated_by: "seed" },
    { id: "doc-team-intro", kind: "소개서", title: "팀 소개서 (대외용)", version: "0818", url: null, when: "미팅", note: "드라이브 링크 등록 필요. 실명판은 별도", updated_at: t, updated_by: "seed" },
    { id: "doc-poster-benefit", kind: "포스터", title: "혜택 정리 포스터 · QR 스티커", version: "0906", url: null, when: "입금 확인 → 비치물 전달", note: "매장별 혜택 %가 다르니 출력 전 확인 (라라더 오기재 사례). 링크 등록 필요", updated_at: t, updated_by: "seed" },
    { id: "doc-mileage-guide", kind: "안내문", title: "마일리지 추첨 안내 (점주용)", version: "0906", url: null, when: "계약 완료", note: "계약서 제8~10조를 점주 말로. 금지 표현('전원 당첨' 등) 주의. 링크 등록 필요", updated_at: t, updated_by: "seed" },
    { id: "doc-report-sample", kind: "기타", title: "매장 성과 보고 예시 (라라더 0906)", version: "0906", url: null, when: "계약 완료", note: "Probe 매장 리포트가 이 문장 구조를 따른다. 링크 등록 필요", updated_at: t, updated_by: "seed" },
  ];
}

/**
 * 발행 주체 — 개인사업자 코끼리. 볼타 키·인증서는 아직 없다.
 *
 * **사업자번호·대표자명은 소스에 넣지 않는다** (이 레포는 공개다). 화면에서 한 번 입력하면 초안 저장소에 남고,
 * 운영에서는 백엔드 `Issuer` 레코드가 갖는다. 로컬에서 채워 보려면 `ASTRO_ISSUER_BIZ_NO` 를 쓴다.
 */
export function seedIssuer(): IssuerSettings {
  return {
    name: "코끼리 (우주라이크)",
    biz_no: process.env.ASTRO_ISSUER_BIZ_NO ?? "",
    ceo: process.env.ASTRO_ISSUER_CEO ?? "",
    address: "",
    email: "",
    bolta_customer_key: null,
    cert_expires_at: null,
    item_template: "우주라이크 파트너 플랜 {period}분",
    approver: process.env.ASTRO_ISSUER_CEO ?? "",
    slack_channel: "ops-partner",
    updated_at: null,
  };
}

/** 계산서 건은 비워 둔다. '이번 달 일괄 생성' 버튼이 유료 매장에서 만든다. */
export function seedInvoices(): TaxInvoice[] {
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
