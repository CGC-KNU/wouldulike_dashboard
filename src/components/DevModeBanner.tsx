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
    <div className="w-full bg-[#0A0676] text-white text-xs flex items-center justify-between px-4 py-1.5">
      <span className="font-mono font-semibold opacity-70">관리자 모드</span>
      <div className="flex gap-2">
        <Link
          href={ownerHref}
          className={`px-2.5 py-0.5 rounded-full font-semibold transition-colors ${
            currentMode === "owner"
              ? "bg-white text-[#0A0676]"
              : "bg-white/20 hover:bg-white/30 text-white"
          }`}
        >
          👤 사장님 뷰
        </Link>
        <Link
          href="/dashboard/admin"
          className={`px-2.5 py-0.5 rounded-full font-semibold transition-colors ${
            currentMode === "admin"
              ? "bg-white text-[#0A0676]"
              : "bg-white/20 hover:bg-white/30 text-white"
          }`}
        >
          🔧 관리자 뷰
        </Link>
      </div>
    </div>
  );
}
