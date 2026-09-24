"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BenefitCatalogSection, StampRuleSection } from "@/components/CouponCatalog";
import { Spinner } from "@/app/dashboard/admin/_shared/ui";
import { IconLock } from "@tabler/icons-react";

/**
 * 혜택 카탈로그 편집 — **우리 쪽 화면이다** (민열님 0924).
 *
 * ## 왜 주소가 `owner` 아래인가
 * 원래 사장님 화면이었다. 0924 에 혜택 바꾸는 길을 '신청 → 승인' 하나로 모으면서
 * 사장님에게는 닫았다. 그런데 **관리자에게는 이 화면이 유일한 카탈로그 편집기다** —
 * 매장 등록 모달 안에만 같은 편집기가 있어서, 이미 등록된 매장은 여기로만 들어온다.
 * 그래서 주소는 그대로 두고 **누가 들어왔는지로 가른다.**
 *
 * ## 사장님이 들어오면
 * 막다른 길로 두지 않는다. 바꾸고 싶어서 온 사람이니 신청하는 자리로 보낸다.
 *
 * 판정은 `/api/dashboard/admin/me` 한 번. 점주 토큰이면 여기서 403 이 온다.
 */
function useRid() {
  const [rid, setRid] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setRid(new URLSearchParams(window.location.search).get("rid"));
  }, []);
  return rid;
}

export default function CouponsPage() {
  const rid = useRid();
  const [admin, setAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/admin/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAdmin(Boolean(d?.permissions?.can_restaurants)))
      .catch(() => setAdmin(false));
  }, []);

  if (rid === undefined || admin === null) {
    return <div className="flex justify-center py-16"><Spinner size={20} /></div>;
  }

  if (!admin) {
    const q = rid ? `&rid=${rid}` : "";
    return (
      <div className="px-4 pt-4 pb-10 max-w-lg mx-auto">
        <h1 className="text-xl font-bold text-navy mb-5">쿠폰 & 스탬프</h1>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
          <span className="inline-flex w-12 h-12 rounded-2xl bg-gray-100 items-center justify-center mb-3">
            <IconLock size={22} className="text-gray-400" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-gray-800">혜택은 신청해서 바꿉니다</p>
          <p className="text-[12.5px] text-gray-500 mt-1.5 leading-relaxed">
            혜택은 손님에게 나가는 약속이라 바로 바뀌지 않습니다.
            바꾸고 싶은 내용을 남겨 주시면 우주라이크가 확인한 뒤 반영합니다.
          </p>
          <Link
            href={`/dashboard/owner/restaurant?tab=coupon${q}`}
            className="inline-flex items-center mt-4 h-9 px-4 rounded-xl bg-navy text-white text-[13px] font-semibold active:scale-[0.98] transition-transform"
          >
            혜택 보기 · 변경 신청
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-10 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-navy">쿠폰 & 스탬프</h1>
      <p className="text-[12.5px] text-gray-500 mt-1 mb-5">
        관리자 화면입니다. 여기서 고치면 앱에 바로 나갑니다 — 사장님 신청을 승인한 뒤 여기서 반영해 주세요.
      </p>

      <section className="mb-7">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">혜택 카탈로그</h2>
          <span className="text-[10px] text-gray-400">일반 쿠폰 · 한정 쿠폰</span>
        </div>
        <BenefitCatalogSection rid={rid} />
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">스탬프 규칙</h2>
          <span className="text-[10px] text-gray-400">방문 적립 → 보상 쿠폰</span>
        </div>
        <StampRuleSection rid={rid} />
      </section>
    </div>
  );
}
