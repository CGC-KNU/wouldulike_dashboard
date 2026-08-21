"use client";

import { useEffect, useState } from "react";

import AttendanceDashboard from "./AttendanceDashboard";
import ContentKanban from "./ContentKanban";
import ContentTab from "../ContentTab";
import MyDashboardScreen from "./MyDashboardScreen";
import OverviewScreen from "./OverviewScreen";
import PapillonDashboard from "./PapillonDashboard";
import PlanQuickList from "./PlanQuickList";
import SettingsScreen from "./SettingsScreen";
import SponsorshipList from "./SponsorshipList";
import TaggingConsole from "./TaggingConsole";

type Screen =
  | "calendar"
  | "sponsorship"
  | "kanban"
  | "content-list"
  | "editor-list"
  | "overview"
  | "mine"
  | "post-list"
  | "attendance"
  | "tagging"
  | "banner"
  | "settings";

interface Me {
  display_name: string;
  username: string;
  satellite_role: "LEAD" | "MEMBER";
}

/**
 * 세틀라이트_목업.html 사이드바 순서·구분선을 그대로 따른다.
 *   캘린더 · 콘텐츠 피드백 · 에디터 | 오버뷰 · 내 대시보드 · 게시물 상세 | 근태 · 태깅콘솔 · 배너/팝업 · 설정
 * "배너/팝업"만 원 목업엔 없던 항목 — RD 요청(2026-08-20)으로 설정 바로 위에 추가했다.
 * "콘텐츠 상세" → "콘텐츠 피드백" 명칭 변경 — 마케팅팀 피드백(2026-08-20, 통합 업무
 * 관리 기획안 §8) 반영. "협찬"·"콘텐츠 칸반"도 같은 피드백(§2·§4·§5)으로 캘린더
 * 바로 다음에 새로 추가한 항목이다 — 협찬은 콘텐츠 칸반과 분리된 새 Sponsorship
 * 모델의 목록 화면, 칸반은 백엔드(KanbanBoardView)에는 있었지만 그동안 화면에
 * 연결된 적이 없던 "업무 목록/피드백 대기/완료" 3단 보드다(§5 — RD 질문 2026-08-21
 * "콘텐츠 칸반은 어디로 들어간 거야?"에 대한 답 — 지금까지는 화면이 없었다).
 *
 * "에디터" 목록은 나비게이션 항목 자체는 리드·멤버 모두에게 노출한다(숨기지 않음) —
 * §8/§7 "비담당자: 에디터 접근 불가"는 건별(per-plan) 규칙이라, 목록 진입 자체를 막을
 * 이유가 없다: 멤버도 본인이 담당자인 건은 있고 그 건은 편집 가능해야 하기 때문이다.
 * 실제 접근 제어는 두 곳에서 이미 이뤄진다 — ① QuickPlanListView가 멤버에게는 본인
 * 담당 건만 내려주고(§05-4), ② PlanEditor가 plan.can_edit=false인 건은 "에디터" 탭
 * 버튼 자체를 렌더링하지 않는다. 그래서 멤버가 "에디터"를 눌러도 결과적으로 본인 담당
 * 건만 보이고, 그 안에서도 편집 불가능한 건은 에디터 탭이 뜨지 않아 규칙이 지켜진다.
 */
const NAV: { key: Screen; label: string; icon: string; leadOnly?: boolean; sepBefore?: boolean }[] = [
  { key: "calendar", label: "캘린더", icon: "▦" },
  { key: "sponsorship", label: "협찬", icon: "◆" },
  { key: "kanban", label: "콘텐츠 칸반", icon: "▧" },
  { key: "content-list", label: "콘텐츠 피드백", icon: "✎" },
  { key: "editor-list", label: "에디터", icon: "⊕" },
  { key: "overview", label: "오버뷰", icon: "◎", sepBefore: true },
  { key: "mine", label: "내 대시보드", icon: "◐" },
  { key: "post-list", label: "게시물 상세", icon: "▤" },
  { key: "attendance", label: "근태", icon: "⏱", leadOnly: true, sepBefore: true },
  { key: "tagging", label: "태깅 콘솔", icon: "⊞", leadOnly: true },
  { key: "banner", label: "배너/팝업", icon: "▥", leadOnly: true },
  { key: "settings", label: "설정", icon: "⚙", leadOnly: true },
];

/**
 * Papillon 앱 셸.
 *
 * "콘텐츠 피드백"·"에디터"·"게시물 상세"는 목업에선 정적 화면이라 특정 게시물이 미리
 * 정해져 있지만, 실제 앱은 항상 특정 건(plan)을 열어야 한다. RD 결정(2026-08-20,
 * AskUserQuestion) — 세 메뉴는 목록 화면(PlanQuickList)으로 이동하고, 목록에서 행을
 * 클릭하면 그 건의 PlanEditor 가 해당 탭으로 열린다. 캘린더 카드를 클릭했을 때 뜨는
 * 기존 PlanEditor 모달 흐름은 그대로 유지된다 — 이 세 메뉴는 "어디서 시작하든 결국
 * 같은 PlanEditor 로 들어간다"는 별도 진입로일 뿐이다.
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
            <div key={n.key} className="contents">
              {n.sepBefore && <div className="hidden md:block h-px bg-white/10 my-1.5" />}
              <button
                onClick={() => setScreen(n.key)}
                className={`flex items-center gap-2.5 text-left text-xs font-semibold rounded-lg px-3 py-2.5 whitespace-nowrap transition-colors ${
                  screen === n.key ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="w-4 text-center opacity-85">{n.icon}</span>
                {n.label}
              </button>
            </div>
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
        {screen === "sponsorship" && <SponsorshipList />}
        {screen === "kanban" && <ContentKanban />}
        {screen === "content-list" && (
          <PlanQuickList
            status="active"
            initialTab="detail"
            title="콘텐츠 피드백"
            subtitle={isLead ? "세팅 완료(ready) 이후 콘텐츠 전체 — 클릭하면 열람·댓글 화면이 열립니다" : "본인 담당 중인 콘텐츠 — 클릭하면 열람·댓글 화면이 열립니다"}
            emptyLabel="진행 중인 콘텐츠가 없습니다."
          />
        )}
        {screen === "editor-list" && (
          <PlanQuickList
            status="active"
            initialTab="content"
            title="에디터"
            subtitle={isLead ? "진행 중인 콘텐츠 전체 — 클릭하면 바로 에디터가 열립니다" : "본인이 작업 중인 콘텐츠 — 클릭하면 바로 에디터가 열립니다"}
            emptyLabel="작업 중인 콘텐츠가 없습니다."
          />
        )}
        {screen === "overview" && <OverviewScreen />}
        {screen === "mine" && <MyDashboardScreen />}
        {screen === "post-list" && (
          <PlanQuickList
            status="published"
            initialTab="post"
            title="게시물 상세"
            subtitle={isLead ? "발행완료 게시물 전체 — 클릭하면 성과·인사이트가 열립니다" : "본인이 발행한 게시물 — 클릭하면 성과·인사이트가 열립니다"}
            emptyLabel="발행된 게시물이 없습니다."
          />
        )}
        {screen === "attendance" && isLead && <AttendanceDashboard embedded onClose={() => setScreen("calendar")} />}
        {screen === "tagging" && isLead && <TaggingConsole embedded onClose={() => setScreen("calendar")} />}
        {screen === "banner" && isLead && <ContentTab />}
        {screen === "settings" && isLead && <SettingsScreen />}
      </main>
    </div>
  );
}
