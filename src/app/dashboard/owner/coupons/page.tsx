"use client";

import { useState, useEffect } from "react";
import { BenefitCatalogSection, StampRuleSection } from "@/components/CouponCatalog";

/* ─── rid 헬퍼 ─────────────────────────────────────── */
// undefined = 아직 초기화 안 됨, null = ?rid 파라미터 없음, string = rid 값
function useRid() {
  const [rid, setRid] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setRid(p.get("rid")); // null or "33"
  }, []);
  return rid;
}

/* ════════════════════════════════════════════════════
   메인 페이지
════════════════════════════════════════════════════ */
export default function CouponsPage() {
  const rid = useRid();

  // rid가 undefined = 아직 URL 파싱 전 (클라이언트 마운트 대기 중)
  // 이 상태에서 섹션이 마운트되면 restaurant_id 없이 API를 호출해 빈 화면 깜빡임 발생
  if (rid === undefined) {
    return (
      <div className="px-4 pt-4 max-w-lg mx-auto pb-8">
        <h1 className="text-lg font-bold text-navy mb-5">쿠폰·스탬프</h1>
        <div className="flex justify-center py-10">
          <div className="w-5 h-5 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 max-w-lg mx-auto pb-8">
      <h1 className="text-lg font-bold text-navy mb-5">쿠폰·스탬프</h1>

      {/* 혜택 카탈로그 섹션 */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">혜택 카탈로그</h2>
          <span className="text-[10px] text-gray-400">일반·특별·스탬프 혜택을 만들고 쿠폰에 연결</span>
        </div>
        <BenefitCatalogSection rid={rid} />
      </section>

      {/* 스탬프 규칙 섹션 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">스탬프 규칙</h2>
          <span className="text-[10px] text-gray-400">방문 적립 → 보상 쿠폰 자동 지급</span>
        </div>
        <StampRuleSection rid={rid} />
      </section>
    </div>
  );
}
