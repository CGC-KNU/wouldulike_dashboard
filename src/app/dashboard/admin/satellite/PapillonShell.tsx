"use client";

import { useEffect, useState } from "react";

import ToolShell from "../_shared/ToolShell";
import AttendanceDashboard from "./AttendanceDashboard";
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
 * 관리 기획안 §8) 반영. "협찬"도 같은 피드백(§2·§4)으로 캘린더 바로 다음에 새로
 * 추가한 항목이다 — 콘텐츠 칸반과 분리된 새 Sponsorship 모델의 목록 화면.
 *
 * "콘텐츠 칸반"은 한동안 여기 독립 메뉴로 있었다가(§5 — RD 질문 2026-08-21 "콘텐츠
 * 칸반은 어디로 들어간 거야?"에 대한 답이었다), RD 요청(2026-08-21)으로 다시 메인
 * 화면(PapillonDashboard, "캘린더" 메뉴) 안으로 옮겨졌다 — 리스트와 캘린더 사이에
 * 낀 3번째 구획으로 렌더링된다. 세 구획의 순서는 PapillonDashboard 자체의
 * localStorage 설정으로 사용자가 바꿀 수 있어서, 더 이상 사이드바 메뉴가 필요 없다.
 *
 * "에디터" 목록은 나비게이션 항목 자체는 리드·멤버 모두에게 노출한다(숨기지 않음) —
 * §8/§7 "비담당자: 에디터 접근 불가"는 건별(per-plan) 규칙이라, 목록 진입 자체를 막을
 * 이유가 없다: 멤버도 본인이 담당자인 건은 있고 그 건은 편집 가능해야 하기 때문이다.
 * 실제 접근 제어는 두 곳에서 이미 이뤄진다 — ① QuickPlanListView가 멤버에게는 본인
 * 담당 건만 내려주고(§05-4), ② PlanEditor가 plan.can_edit=false인 건은 "에디터" 탭
 * 버튼 자체를 렌더링하지 않는다. 그래서 멤버가 "에디터"를 눌러도 결과적으로 본인 담당
 * 건만 보이고, 그 안에서도 편집 불가능한 건은 에디터 탭이 뜨지 않아 규칙이 지켜진다.
 */
const NAV: { key: Screen; label: string; leadOnly?: boolean; sepBefore?: boolean }[] = [
  { key: "calendar", label: "캘린더" },
  { key: "sponsorship", label: "협찬" },
  { key: "content-list", label: "콘텐츠 피드백" },
  { key: "editor-list", label: "에디터" },
  { key: "overview", label: "오버뷰", sepBefore: true },
  { key: "mine", label: "내 대시보드" },
  { key: "post-list", label: "게시물 상세" },
  { key: "attendance", label: "근태", leadOnly: true, sepBefore: true },
  { key: "tagging", label: "태깅 콘솔", leadOnly: true },
  { key: "banner", label: "배너/팝업", leadOnly: true },
  { key: "settings", label: "설정", leadOnly: true },
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
export default function PapillonShell({ onBack }: { onBack?: () => void } = {}) {
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
    /* 0914: 사이드바만 Astro·Probe 와 같은 것(ToolShell)으로 바꿨다.
       항목·순서·구분선·리드 전용 규칙·화면 연결은 위와 아래 그대로다. */
    <ToolShell
      product={{ key: "papillon", name: "Papillon", subtitle: "마케팅 툴" }}
      navItems={visibleNav.map((n) => ({ key: n.key, label: n.label, sepBefore: n.sepBefore }))}
      activeKey={screen}
      onSelect={(key) => setScreen(key as Screen)}
      onBack={onBack}
      user={{ name: me ? me.display_name || me.username : "", role: me ? (isLead ? "리드" : "멤버") : "" }}
    >
      {/* 떠 있는 도크가 마지막 줄을 가리지 않게. 도크는 메인으로 돌아갈 수 있을 때만 뜬다. */}
      <div className={`min-w-0 max-w-6xl ${onBack ? "pb-24" : ""}`}>
        {screen === "calendar" && <PapillonDashboard />}
        {screen === "sponsorship" && <SponsorshipList />}
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
      </div>
    </ToolShell>
  );
}
