"use client";

import Link from "next/link";

interface AdminViewBannerProps {
  currentMode: "owner" | "admin";
  rid?: string; // 파트너 뷰에서 조회 중인 restaurant_id
}

/**
 * 관리자 계정 전용 — 파트너/관리자 뷰 전환 배너
 * is_admin JWT 클레임이 있는 경우 layout에서 렌더링
 */
export default function AdminViewBanner({ currentMode, rid }: AdminViewBannerProps) {
  const ownerHref = rid ? `/dashboard/owner?rid=${rid}` : "/dashboard/owner";

  return (
    <div className="w-full bg-navy text-white text-xs flex items-center justify-between px-4 py-1.5">
      <span className="font-semibold text-white/60 tracking-wide">관리자 모드 — 파트너에게 보이는 화면입니다</span>
      <div className="flex gap-2">
        <Link
          href={ownerHref}
          className={`px-2.5 py-0.5 rounded-full font-semibold transition-colors ${
            currentMode === "owner"
              ? "bg-white text-navy"
              : "bg-white/20 hover:bg-white/30 text-white"
          }`}
        >
          파트너 뷰
        </Link>
        <Link
          href="/dashboard/admin"
          className={`px-2.5 py-0.5 rounded-full font-semibold transition-colors ${
            currentMode === "admin"
              ? "bg-white text-navy"
              : "bg-white/20 hover:bg-white/30 text-white"
          }`}
        >
          관리자 뷰
        </Link>
      </div>
    </div>
  );
}
