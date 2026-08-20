"use client";

import { useEffect, useState } from "react";

import AttendanceDashboard from "./AttendanceDashboard";
import MyDashboardScreen from "./MyDashboardScreen";
import OverviewScreen from "./OverviewScreen";
import PapillonDashboard from "./PapillonDashboard";
import SettingsScreen from "./SettingsScreen";
import TaggingConsole from "./TaggingConsole";

type Screen = "calendar" | "overview" | "mine" | "attendance" | "tagging" | "settings";

interface Me {
  display_name: string;
  username: string;
  satellite_role: "LEAD" | "MEMBER";
}

const NAV: { key: Screen; label: string; icon: string; leadOnly?: boolean }[] = [
  { key: "calendar", label: "캘린더", icon: "▦" },
  { key: "overview", label: "오버뷰", icon: "◎" },
  { key: "mine", label: "내 대시보드", icon: "◐" },
  { key: "attendance", label: "근태", icon: "⏱", leadOnly: true },
  { key: "tagging", label: "태깅 콘솔", icon: "⊞", leadOnly: true },
  { key: "settings", label: "설정", icon: "⚙", leadOnly: true },
];

/**
 * Papillon 앱 셸 — 세틀라이트_목업.html 의 사이드바 구조(캘린더/오버뷰/내 대시보드/
 * 근태/태깅콘솔/설정)를 그대로 따른다. "콘텐츠 상세"·"에디터"·"게시물 상세"는 별도
 * 사이드바 항목이 아니라 기존처럼 카드를 클릭하면 뜨는 PlanEditor 모달로 처리한다 —
 * 목업 자체가 "클릭하면 상황에 따라 에디터/상세로 분기한다"고 정의하고 있어서, 이미
 * 그 라우팅을 하는 PlanEditor 를 굳이 화면 두 개로 쪼갤 이유가 없다.
 */
export default function PapillonShell() {
  const [screen, setScreen] = useState<Screen>("calendar");
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d))
      .catch(() => setMe(null));
  }, []);

  const isLead = me?.satellite_role === "LEAD";
  const visibleNav = NAV.filter((n) => !n.leadOnly || isLead);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 items-start">
      <aside className="bg-navy rounded-2xl p-3 md:p-4 md:sticky md:top-4">
        <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
          {visibleNav.map((n) => (
            <button
              key={n.key}
              onClick={() => setScreen(n.key)}
              className={`flex items-center gap-2.5 text-left text-xs font-semibold rounded-lg px-3 py-2.5 whitespace-nowrap transition-colors ${
                screen === n.key ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="w-4 text-center opacity-85">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </div>
        {me && (
          <div className="hidden md:block mt-4 pt-4 border-t border-white/10">
            <p className="text-xs font-bold text-white">{me.display_name || me.username}</p>
            <p className="text-[10px] text-white/50 mt-0.5">{isLead ? "리드" : "멤버"}</p>
          </div>
        )}
      </aside>

      <main className="min-w-0 max-w-6xl">
        {screen === "calendar" && <PapillonDashboard />}
        {screen === "overview" && <OverviewScreen />}
        {screen === "mine" && <MyDashboardScreen />}
        {screen === "attendance" && isLead && <AttendanceDashboard embedded onClose={() => setScreen("calendar")} />}
        {screen === "tagging" && isLead && <TaggingConsole embedded onClose={() => setScreen("calendar")} />}
        {screen === "settings" && isLead && <SettingsScreen />}
      </main>
    </div>
  );
}
