"use client";

import { useEffect, useState } from "react";
import NotificationBell from "./NotificationBell";
import { useThemeToggle } from "./ThemeClock";

type Department = "SUPERADMIN" | "ADMIN" | "MARKETING" | "SALES";

interface Me {
  display_name: string;
  /** 대외 직함 (PO·CEO / TL·CTO / ML). 권한(department)과 다른 축이라 따로 온다. */
  title?: string;
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
  const { theme, toggle } = useThemeToggle();

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
        {/* 0914 민열님: 이 바의 이름은 **툴 이름**이다. 회사 이름은 설명으로 내린다 —
            "우주라이크"가 크게 박혀 있으면 이게 회사 홈인지 툴인지 구분이 안 됐다. */}
        <span className="text-[15px] font-bold tracking-[-0.01em] shrink-0">세틀라이트</span>
        <span className="hidden sm:inline text-[12px] font-medium text-white/45 shrink-0">우주라이크 업무 시스템</span>
      </a>

      <span aria-hidden="true" className="hidden sm:block w-px h-4 bg-white/15" />

      {me ? (
        <div className="hidden sm:flex items-center gap-1.5 min-w-0">
          <span className={`text-[11px] font-semibold px-2 py-[3px] rounded-full shrink-0 ${DEPT_BADGE[me.department] ?? DEPT_BADGE.ADMIN}`}>
            {me.department_label}
          </span>
        </div>
      ) : (
        <span className="hidden sm:block bg-white/10 rounded-full w-16 h-5 animate-pulse" />
      )}

      <div className="ml-auto flex items-center gap-2 shrink-0">
        {/* 뷰 전환 — 애딧의 '광고주 전환 / 파트너 전환' 자리. 지금 어느 눈으로 보고 있는지가 늘 보인다. */}
        <div className="inline-flex items-center p-[3px] rounded-full bg-white/10" role="group" aria-label="보기 전환">
          <a href="/dashboard/owner" className="px-2.5 py-1 rounded-full text-[12px] font-semibold text-white/70 hover:text-white transition-colors">파트너</a>
          {/* 지금 자리 = 그 사람의 직함. 없으면 직무 이름으로 돌아간다 (민열님 0918) */}
          <span aria-current="page" title="관리자 화면" className="px-2.5 py-1 rounded-full text-[12px] font-bold bg-white text-navy shadow-sm whitespace-nowrap">{me?.title || me?.department_label || "관리자"}</span>
        </div>

        {me && (
          <span className="hidden md:inline-flex items-center gap-1.5 text-[12px] text-white/70 max-w-[160px]">
            <span aria-hidden="true" className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center text-[11px] font-bold text-white">
              {(me.display_name || me.username || "?").trim().slice(0, 1)}
            </span>
            <span className="truncate">{me.display_name || me.username}</span>
          </span>
        )}
        {/* 처리해야 할 것 — 지금은 혜택 변경 신청. 슬랙은 흘러가지만 이 숫자는 남는다 (0924). */}
        <NotificationBell />

        {/* 18시부터 저절로 어두워진다. 여기서 바꾸면 그날은 그 선택이다. */}
        <button type="button" onClick={toggle} aria-label={theme === "dark" ? "라이트 모드로" : "다크 모드로"} title={theme === "dark" ? "라이트 모드로 (오늘만)" : "다크 모드로 (오늘만)"}
           className="w-8 h-8 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
          {theme === "dark"
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>}
        </button>
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
