"use client";

import { useEffect, useState } from "react";

type Department = "SUPERADMIN" | "ADMIN" | "MARKETING" | "SALES";

interface Me {
  display_name: string;
  username: string;
  department: Department;
  department_label: string;
  satellite_role: "LEAD" | "MEMBER";
}

/** 직무별 뱃지 색. 한눈에 계열이 구분되도록 서로 다른 톤을 쓴다. */
const DEPT_BADGE: Record<Department, string> = {
  SUPERADMIN: "bg-navy/[0.08] text-navy",
  ADMIN: "bg-black/[0.06] text-gray-700",
  MARKETING: "bg-gold/15 text-amber-800",
  SALES: "bg-emerald-500/10 text-emerald-800",
};

export default function AdminHeader() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d))
      .catch(() => setMe(null));
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/75 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 border-b border-black/[0.06] px-4 h-12 flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[15px] font-bold tracking-[-0.01em] text-navy shrink-0">우주라이크</span>
        {me ? (
          <>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                DEPT_BADGE[me.department] ?? DEPT_BADGE.ADMIN
              }`}
            >
              {me.department_label}
            </span>
            {me.satellite_role === "LEAD" && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-black/[0.05] text-gray-500 shrink-0">
                세틀 리드
              </span>
            )}
          </>
        ) : (
          <span className="text-xs bg-black/[0.05] px-2 py-0.5 rounded-full w-14 h-5 animate-pulse" />
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {me && (
          <span className="text-xs text-gray-600 truncate max-w-[120px]">
            {me.display_name || me.username}
          </span>
        )}
        <a
          href="/api/auth/logout"
          className="text-xs text-gray-400 hover:text-gray-900 transition-colors"
        >
          로그아웃
        </a>
      </div>
    </header>
  );
}
