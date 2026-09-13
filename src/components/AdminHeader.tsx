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
  SUPERADMIN: "bg-white text-navy",
  ADMIN: "bg-white/20 text-white",
  MARKETING: "bg-gold/90 text-white",
  SALES: "bg-emerald-400/90 text-white",
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
    /* 0914 민열님: 상단을 한 줄로. 애딧 콘솔처럼 얇고 조용하게 — 이름·역할은 왼쪽, 뷰 전환·사람은 오른쪽.
       '관리자 모드' 띠를 따로 두지 않고 뷰 전환 세그먼트가 그 역할을 한다. */
    <header className="sticky top-0 z-40 h-14 bg-[#050072]/95 backdrop-blur-xl text-white border-b border-white/10 flex items-center gap-3 px-4">
      {/* 마크와 이름을 누르면 메인(런처)으로 — 어느 툴에 있든 집으로 가는 길 */}
      <a href="/dashboard/admin" aria-label="메인으로"
         className="flex items-center gap-2 min-w-0 rounded-xl px-1.5 -mx-1.5 py-1 hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
        <img src="/satellite/satellite_app.svg" alt="" width={26} height={26} className="w-[26px] h-[26px] rounded-[8px] shrink-0 ring-1 ring-white/25" aria-hidden="true" />
        <span className="text-[15px] font-bold tracking-[-0.01em] shrink-0">우주라이크</span>
        <span className="hidden sm:inline text-[12px] font-medium text-white/45 shrink-0">Satellite</span>
      </a>

      <span aria-hidden="true" className="hidden sm:block w-px h-4 bg-white/15" />

      {me ? (
        <div className="hidden sm:flex items-center gap-1.5 min-w-0">
          <span className={`text-[11px] font-semibold px-2 py-[3px] rounded-full shrink-0 ${DEPT_BADGE[me.department] ?? DEPT_BADGE.ADMIN}`}>
            {me.department_label}
          </span>
          {me.satellite_role === "LEAD" && (
            <span className="text-[10px] font-semibold px-1.5 py-[3px] rounded-full bg-white/12 text-white/70 shrink-0">세틀 리드</span>
          )}
        </div>
      ) : (
        <span className="hidden sm:block bg-white/10 rounded-full w-16 h-5 animate-pulse" />
      )}

      <div className="ml-auto flex items-center gap-2 shrink-0">
        {/* 뷰 전환 — 애딧의 '광고주 전환 / 파트너 전환' 자리. 지금 어느 눈으로 보고 있는지가 늘 보인다. */}
        <div className="inline-flex items-center p-[3px] rounded-full bg-white/10" role="group" aria-label="보기 전환">
          <a href="/dashboard/owner" className="px-2.5 py-1 rounded-full text-[12px] font-semibold text-white/70 hover:text-white transition-colors">파트너</a>
          <span aria-current="page" className="px-2.5 py-1 rounded-full text-[12px] font-bold bg-white text-navy shadow-sm">관리자</span>
        </div>

        {me && (
          <span className="hidden md:inline-flex items-center gap-1.5 text-[12px] text-white/70 max-w-[160px]">
            <span aria-hidden="true" className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center text-[11px] font-bold text-white">
              {(me.display_name || me.username || "?").trim().slice(0, 1)}
            </span>
            <span className="truncate">{me.display_name || me.username}</span>
          </span>
        )}
        <a href="/api/auth/logout" aria-label="로그아웃" title="로그아웃"
           className="w-8 h-8 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>
    </header>
  );
}
