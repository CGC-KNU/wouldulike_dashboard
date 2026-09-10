"use client";

import Link from "next/link";

interface AdminViewBannerProps {
  currentMode: "owner" | "admin";
  rid?: string; // 사장님 뷰에서 조회 중인 restaurant_id
}

/**
 * 관리자 계정 전용 — 사장님/관리자 뷰 전환 배너
 * is_admin JWT 클레임이 있는 경우 layout에서 렌더링
 */
export default function AdminViewBanner({ currentMode, rid }: AdminViewBannerProps) {
  const ownerHref = rid ? `/dashboard/owner?rid=${rid}` : "/dashboard/owner";

  return (
    // 얇은 회색 스트립. 뷰 전환은 iOS 세그먼트 모양 — 두꺼운 네이비 띠 두 장이 화면 위를 누르지 않게 (2026-09-10).
    <div className="w-full bg-[#f5f5f7] text-[12px] flex items-center justify-between px-4 h-8 border-b border-black/[0.05]">
      <span className="font-semibold text-gray-500">관리자 모드</span>
      <div className="inline-flex h-6 p-[2px] bg-black/[0.06] rounded-[8px]">
        <Link
          href={ownerHref}
          className={`px-2.5 rounded-[6px] font-semibold leading-5 transition-colors ${
            currentMode === "owner" ? "bg-white text-gray-900 shadow-[0_1px_2px_rgba(16,24,40,0.12)]" : "text-gray-500 hover:text-gray-800"
          }`}
        >
          사장님 뷰
        </Link>
        <Link
          href="/dashboard/admin"
          className={`px-2.5 rounded-[6px] font-semibold leading-5 transition-colors ${
            currentMode === "admin" ? "bg-white text-gray-900 shadow-[0_1px_2px_rgba(16,24,40,0.12)]" : "text-gray-500 hover:text-gray-800"
          }`}
        >
          관리자 뷰
        </Link>
      </div>
    </div>
  );
}
