"use client";

import Link from "next/link";

interface DevModeBannerProps {
  currentMode: "owner" | "admin";
}

/**
 * 개발 환경 전용 상단 배너 — 사장님/관리자 모드 전환
 */
export default function DevModeBanner({ currentMode }: DevModeBannerProps) {
  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div className="w-full bg-amber-400 text-amber-900 text-xs flex items-center justify-between px-4 py-1.5">
      <span className="font-mono font-semibold">🛠 DEV · 정든밤</span>
      <div className="flex gap-2">
        <Link
          href="/dashboard/owner"
          className={`px-2.5 py-0.5 rounded-full font-semibold transition-colors ${
            currentMode === "owner"
              ? "bg-amber-900 text-amber-100"
              : "bg-amber-200 hover:bg-amber-300 text-amber-900"
          }`}
        >
          👤 사장님
        </Link>
        <Link
          href="/dashboard/admin"
          className={`px-2.5 py-0.5 rounded-full font-semibold transition-colors ${
            currentMode === "admin"
              ? "bg-amber-900 text-amber-100"
              : "bg-amber-200 hover:bg-amber-300 text-amber-900"
          }`}
        >
          🔧 관리자
        </Link>
      </div>
    </div>
  );
}
