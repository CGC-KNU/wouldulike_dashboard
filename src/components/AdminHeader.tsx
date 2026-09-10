"use client";

import { useEffect, useState } from "react";
import { IconLogout } from "@tabler/icons-react";

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

/**
 * 상단 바. 왼쪽 워드마크(brand/wordmark.png) · 오른쪽 사람.
 * 반투명 유리 한 겹에 헤어라인 하나. 글자는 워드마크 하나만 크고 나머지는 작게 — 바가 화면의 주인공이 아니다.
 */
export default function AdminHeader() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d))
      .catch(() => setMe(null));
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/70 backdrop-blur-2xl saturate-150 supports-[backdrop-filter]:bg-white/60 border-b border-black/[0.06] px-4 md:px-5 h-[52px] flex items-center justify-between">
      <a href="/dashboard/admin" className="flex items-center gap-3 min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40" aria-label="우주라이크 세틀라이트 홈">
        {/* 워드마크 원본은 흰색 PNG — 마스크로 잘라 네이비로 채운다. 배경이 바뀌어도 색 하나로 통제된다. */}
        <span role="img" aria-label="우주라이크" className="block h-[17px] w-[97px] bg-navy" style={{ WebkitMaskImage: "url(/brand/wordmark.png)", maskImage: "url(/brand/wordmark.png)", WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "left center", maskPosition: "left center" }} />
        <span className="hidden sm:inline text-[11px] font-semibold text-gray-400 tracking-wide border-l border-black/[0.08] pl-3">Satellite</span>
      </a>

      <div className="flex items-center gap-2 shrink-0">
        {me ? (
          <>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${DEPT_BADGE[me.department] ?? DEPT_BADGE.ADMIN}`}>{me.department_label}</span>
            {me.satellite_role === "LEAD" && <span className="hidden sm:inline text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-black/[0.05] text-gray-500">세틀 리드</span>}
            <span className="inline-flex items-center gap-2 pl-1.5 pr-1 py-1 rounded-full bg-black/[0.04]">
              <span className="w-6 h-6 rounded-full bg-[linear-gradient(135deg,#6366E0,#050072)] text-white text-[11px] font-bold flex items-center justify-center">{(me.display_name || me.username).slice(0, 1)}</span>
              <span className="text-[12px] font-semibold text-gray-800 truncate max-w-[110px]">{me.display_name || me.username}</span>
              <a href="/api/auth/logout" aria-label="로그아웃" title="로그아웃" className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-white transition-colors"><IconLogout size={14} aria-hidden="true" /></a>
            </span>
          </>
        ) : (
          <span className="h-7 w-28 rounded-full bg-black/[0.05] animate-pulse" />
        )}
      </div>
    </header>
  );
}
