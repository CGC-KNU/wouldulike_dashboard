"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  IconActivityHeartbeat,
  IconChartArrowsVertical,
  IconLayoutKanban,
  IconActivity,
  IconAlertTriangle,
  IconArrowsExchange,
  IconBuildingStore,
  IconCalendarMonth,
  IconCash,
  IconChartBar,
  IconChevronDown,
  IconChevronLeft,
  IconCoins,
  IconUsersGroup,
  IconClipboardList,
  IconClockHour4,
  IconDeviceMobile,
  IconFileDescription,
  IconFileInvoice,
  IconFiles,
  IconFolder,
  IconGift,
  IconHeartHandshake,
  IconHome,
  IconLayoutGrid,
  IconBell,
  IconMessage2,
  IconMessageChatbot,
  IconMovie,
  IconFileText,
  IconPencil,
  IconPhoto,
  IconPresentationAnalytics,
  IconSettings,
  IconSitemap,
  IconTags,
  IconTargetArrow,
  IconUserCircle,
  IconFileDollar,
} from "@tabler/icons-react";
import { focusRing } from "./ui";

/**
 * 세틀라이트 툴 공용 셸 (Astro · Probe · Castor · Aether).
 *
 * 애딧 Pitchr 의 구조를 따른다: 흰 사이드바(아이콘 + 라벨) · 활성 항목만 색 · 하단에 사용자.
 * 예전 네이비 블록 사이드바는 화면 안에서 가장 진한 덩어리라 눈이 먼저 거기로 갔다.
 * 사이드바는 길잡이지 주인공이 아니다. 주인공은 오른쪽 표와 숫자다.
 *
 * 0914 민열님: Papillon · Aether 도 같은 메뉴로 통일한다("빠삐용 메뉴창도 이렇게 통일할까요?" — 아윤님 동의).
 * **생김새만 맞춘다.** 항목·순서·구분선·권한(리드 전용)·화면은 전부 그대로다.
 */

export interface ToolNavItem {
  key: string;
  label: string;
  /** 위에 가는 선을 하나 긋는다 — Papillon 목업의 묶음 구분을 그대로 살린다. */
  sepBefore?: boolean;
  /**
   * 접고 펼 수 있는 묶음 (민열님 0928: "파트너 관리(매장·계약·후보) · 정산(입금 현황·세금계산서)").
   * 묶음 자체는 화면이 아니다 — 누르면 접히고 펴진다. 안에 있는 화면이 열려 있으면 저절로 펴진다.
   * 접힌 동안 배지는 안쪽 것을 합쳐 묶음에 단다. 접힘 상태는 이 브라우저에 남는다.
   */
  children?: ToolNavItem[];
}

const GROUPS_KEY = "toolshell.groups.v1";
function readGroups(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "{}") as Record<string, boolean>; } catch { return {}; }
}

/** 하단 도크 — 앱의 탭바처럼 툴을 바꾼다 (민열님 0911: "하단에서 우주라이크 앱처럼 툴을 고를 수 있으면"). */
export interface ToolDock {
  tools: { key: string; name: string }[];
  active: string;
  onSwitch: (key: string) => void;
  onHome: () => void;
  /** "리브라랑 대화하기" — 이 툴의 슬랙 채널을 열고 `@Libra [화면]` 을 클립보드에 넣는다 (민열님 0911). */
  libra?: { channelUrl: string; channel: string; context: string };
}

const NAV_ICON: Record<string, typeof IconBuildingStore> = {
  "astro-home": IconHome,
  "probe-home": IconHome,
  "castor-home": IconHome,
  "atlas-team": IconSitemap,
  "atlas-mission": IconTargetArrow,
  "atlas-tools": IconLayoutGrid,
  "atlas-history": IconClockHour4,
  "probe-app": IconDeviceMobile,
  "astro-calendar": IconCalendarMonth,
  "astro-spots": IconMovie,
  "astro-ops": IconActivity,
  "astro-partners": IconUsersGroup,
  "astro-finance": IconCoins,
  restaurants: IconBuildingStore,
  "astro-leads": IconTargetArrow,
  "astro-contracts": IconFileText,
  "astro-billing": IconCash,
  "astro-docs": IconFiles,
  "astro-tax": IconFileInvoice,
  "astro-quotes": IconFileDollar,
  "probe-metrics": IconChartBar,
  "probe-quality": IconAlertTriangle,
  "probe-mileage": IconGift,
  "probe-reports": IconFileDescription,
  "castor-map": IconSitemap,
  "castor-flow": IconChartArrowsVertical,
  "castor-events": IconActivityHeartbeat,
  "castor-changes": IconLayoutKanban,
  "castor-experiments": IconArrowsExchange,
  content: IconPhoto,
  "aether-alerts": IconBell,
  notifications: IconBell,
  "restaurant-notifications": IconBuildingStore,
  settings: IconSettings,
  // Papillon (마케팅) — 라벨과 순서는 그대로 두고 아이콘만 같은 집합으로 바꾼다
  calendar: IconCalendarMonth,
  sponsorship: IconHeartHandshake,
  "content-list": IconMessage2,
  "editor-list": IconPencil,
  overview: IconPresentationAnalytics,
  mine: IconUserCircle,
  "post-list": IconClipboardList,
  attendance: IconClockHour4,
  tagging: IconTags,
  banner: IconPhoto,
};

/** 툴 아이콘. `00_레퍼런스_네이밍/툴_아이콘` 앱판(네이비 배경 + 흰 선). 없으면 격자 아이콘. */
function ToolIcon({ k }: { k?: string }) {
  if (!k) {
    return (
      <span className="w-8 h-8 rounded-lg bg-navy text-white flex items-center justify-center shrink-0">
        <IconLayoutGrid size={16} stroke={2} aria-hidden="true" />
      </span>
    );
  }
  return <img src={`/satellite/${k}_app.svg`} alt="" width={32} height={32} className="w-8 h-8 rounded-lg shrink-0" aria-hidden="true" />;
}

/**
 * 켜진 탭의 색. 기본은 네이비인데 **스팟 제작만 핫핑크**다 (민열님 0914).
 *
 * 스팟은 윤지님 혼자 쓰는 탭이라 영업 흐름과 색으로 갈라 둔다 —
 * 옆 사람 화면을 흘깃 봐도 지금 무슨 일을 하는 중인지 구분된다.
 * 색을 늘릴 거면 **쓰는 사람이 갈리는 탭에만** 준다. 탭마다 색이면 아무 뜻이 없다.
 */
const ACCENT_DEFAULT = "bg-[linear-gradient(180deg,#1512a3,#050072)] text-white shadow-[0_6px_16px_-8px_rgba(5,0,114,0.7)]";
const ACCENT: Record<string, string> = {
  "astro-spots": "bg-[linear-gradient(180deg,#FF2D8A,#D6006E)] text-white shadow-[0_6px_16px_-8px_rgba(214,0,110,0.75)]",
};

export default function ToolShell({
  product,
  navItems,
  activeKey,
  onSelect,
  onBack,
  user,
  dock,
  badges = {},
  children,
}: {
  product: { key?: string; name: string; subtitle: string };
  navItems: ToolNavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  onBack?: () => void;
  user: { name: string; role: string };
  dock?: ToolDock;
  /** 사이드바 배지 — "지금 막힌 것" 수. 애딧 콘솔의 "캠페인 관리 39 · 정산 관리 3" 차용. */
  badges?: Record<string, number>;
  children: ReactNode;
}) {
  /** 접힌 묶음. 첫 렌더는 서버와 같게(모두 펼침) 두고, 브라우저에 남긴 값은 마운트 뒤에 읽는다 — 아니면 hydration 이 어긋난다. */
  const [groups, setGroups] = useState<Record<string, boolean>>({});
  useEffect(() => { setGroups(readGroups()); }, []);
  const toggleGroup = (key: string, open: boolean) => {
    setGroups((g) => { const next = { ...g, [key]: open }; try { localStorage.setItem(GROUPS_KEY, JSON.stringify(next)); } catch { /* 무시 */ } return next; });
  };
  return (
    <div className={`grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-0 md:gap-6 items-start ${dock ? "pb-24" : ""}`}>
      <aside className="md:sticky md:top-16 bg-white/70 backdrop-blur-xl rounded-[18px] border border-white/60 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_40px_-28px_rgba(5,0,114,0.35)] overflow-hidden">
        {/* 제품 표시 + 메인(런처)으로 돌아가기 — 폰에서는 위에 '메인으로'가 이미 있어 숨기고 메뉴줄만 남긴다 (0929) */}
        <div className="hidden md:block px-3 pt-3 pb-2 border-b border-black/[0.05]">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 ${focusRing}`}
            >
              <ToolIcon k={product.key} />
              <span className="min-w-0">
                <span className="block text-[14px] font-bold text-gray-900 leading-tight tracking-[-0.01em]">{product.name}</span>
                <span className="block text-[11px] text-gray-500 leading-tight">{product.subtitle}</span>
              </span>
              <span className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-semibold text-gray-400 shrink-0">
                <IconChevronLeft size={14} aria-hidden="true" />메인
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <ToolIcon k={product.key} />
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-gray-900 leading-tight">{product.name}</span>
                <span className="block text-[11px] text-gray-500 leading-tight">{product.subtitle}</span>
              </span>
            </div>
          )}
        </div>

        <nav aria-label={`${product.name} 메뉴`} className="p-2">
          {/* 좁은 화면에서는 탭이 가로줄이 된다 — 오른쪽에 더 있다는 그늘을 둔다 (0914) */}
          <ul className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-visible bg-[linear-gradient(to_right,rgb(var(--card)),rgb(var(--card))),linear-gradient(to_right,rgb(var(--card)),rgb(var(--card))),linear-gradient(to_right,rgba(16,24,40,0.10),rgba(16,24,40,0)),linear-gradient(to_left,rgba(16,24,40,0.10),rgba(16,24,40,0))] bg-[length:22px_100%,22px_100%,14px_100%,14px_100%] bg-[position:left_center,right_center,left_center,right_center] bg-no-repeat [background-attachment:local,local,scroll,scroll] md:bg-none">
            {navItems.map((n) => {
              if (n.children?.length) {
                const inside = n.children.some((c) => c.key === activeKey);
                const open = inside || (groups[n.key] ?? true);
                const sum = n.children.reduce((m, c) => m + (badges[c.key] ?? 0), 0);
                const GIcon = NAV_ICON[n.key] ?? IconLayoutGrid;
                return (
                  <li key={n.key} className="shrink-0 md:shrink contents md:block">
                    {n.sepBefore && <div className="hidden md:block h-px bg-black/[0.06] my-1.5 mx-2" aria-hidden="true" />}
                    {/* 묶음 머리 — 좁은 화면(가로줄)에서는 숨기고 안쪽 항목만 늘어놓는다 */}
                    <button
                      type="button"
                      onClick={() => toggleGroup(n.key, !open)}
                      aria-expanded={open}
                      aria-controls={`nav-group-${n.key}`}
                      className={`hidden md:flex w-full items-center gap-2.5 h-9 px-3 rounded-[10px] text-[13px] font-semibold whitespace-nowrap transition-[background-color,color] duration-150 ${focusRing} ${inside && !open ? "text-navy" : "text-gray-600"} hover:bg-navy/[0.05] hover:text-gray-900`}
                    >
                      <GIcon size={18} stroke={1.75} className={inside ? "text-navy" : "text-gray-400"} aria-hidden="true" />
                      {n.label}
                      {!open && sum ? <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center bg-red-50 text-red-600" aria-label={`${sum}건`}>{sum}</span> : null}
                      <IconChevronDown size={15} stroke={2} className={`${!open && sum ? "ml-1" : "ml-auto"} text-gray-400 transition-transform duration-150 ${open ? "" : "-rotate-90"}`} aria-hidden="true" />
                    </button>
                    <ul id={`nav-group-${n.key}`} className={`contents md:block md:pl-3 md:space-y-0.5 ${open ? "" : "md:hidden"}`}>
                      {n.children.map((c) => <NavLeaf key={c.key} n={c} on={activeKey === c.key} badge={badges[c.key]} onSelect={onSelect} nested />)}
                    </ul>
                  </li>
                );
              }
              return <NavLeaf key={n.key} n={n} on={activeKey === n.key} badge={badges[n.key]} onSelect={onSelect} />;
            })}
          </ul>
        </nav>

        <div className="hidden md:flex items-center gap-2.5 px-4 py-3 border-t border-black/[0.05]">
          <span className="w-7 h-7 rounded-full bg-[linear-gradient(135deg,#6366E0,#050072)] text-white text-[12px] font-bold flex items-center justify-center shrink-0">
            {user.name.slice(0, 1)}
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-gray-900 truncate">{user.name}</span>
            <span className="block text-[11px] text-gray-500 truncate">{user.role}</span>
          </span>
        </div>
      </aside>

      <main className="min-w-0 mt-4 md:mt-0">{children}</main>

      {dock && <Dock {...dock} />}
    </div>
  );
}

/**
 * 하단 도크. 유리 알약 하나에 앱 아이콘이 나란히. 활성 툴은 아이콘 아래 점.
 * 아이콘은 앱판(네이비 면) 그대로라 런처와 같은 얼굴이다. 누르면 그 툴의 첫 화면.
 */
/** 앱 아이콘(/satellite/<key>_app.svg)이 있는 툴. 그 밖의 제품은 도크에서 기호로 그린다. */
const SATELLITE_KEYS = new Set(["papillon", "astro", "aether", "probe", "castor", "libra"]);

export function Dock({ tools, active, onSwitch, onHome, libra }: ToolDock) {
  const [copied, setCopied] = useState(false);
  async function talk() {
    if (!libra) return;
    // 슬랙 링크는 본문을 미리 채우지 못한다. 대신 태그+맥락을 복사해 두고 채널을 연다 — 붙여넣고 질문만 쓰면 된다.
    try { await navigator.clipboard.writeText(`@Libra [${libra.context}] `); setCopied(true); setTimeout(() => setCopied(false), 2400); } catch { /* 무시 */ }
    window.open(libra.channelUrl, "_blank", "noreferrer");
  }
  return (
    /* 폰에서는 도크가 화면보다 넓다(툴 5개 + 런처 + 리브라 = 약 420px).
       예전에는 가운데 정렬만 해서 양끝이 잘려 나갔다 — 왼쪽 '전체'와 오른쪽 '리브라랑 대화'가 반씩 잘렸다.
       이제 화면 폭을 넘지 않게 묶고 그 안에서 가로로 민다. 데스크톱에서는 넘칠 일이 없어 그대로다. */
    <nav aria-label="툴 바꾸기" className="fixed left-0 right-0 bottom-4 z-30 flex justify-center px-3 pointer-events-none">
      <ul className="pointer-events-auto inline-flex items-end gap-1 px-2 py-1.5 rounded-[22px] bg-white/70 backdrop-blur-2xl saturate-150 border border-white/70 shadow-[0_1px_2px_rgba(16,24,40,0.06),0_24px_48px_-24px_rgba(5,0,114,0.5)] max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <li className="shrink-0">
          <button type="button" onClick={onHome} aria-label="런처" className={`group flex flex-col items-center w-[52px] sm:w-14 py-1 rounded-2xl transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-95 ${focusRing}`}>
            <span className="w-10 h-10 rounded-[12px] bg-white border border-black/[0.06] flex items-center justify-center text-navy shadow-sm"><IconLayoutGrid size={18} stroke={2} aria-hidden="true" /></span>
            <span className="text-[10px] font-semibold text-gray-500 mt-1">전체</span>
          </button>
        </li>
        <li aria-hidden="true" className="w-px h-8 bg-black/[0.08] mx-1 mb-3 shrink-0" />
        {tools.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key} className="shrink-0">
              <button type="button" onClick={() => onSwitch(t.key)} aria-current={on ? "page" : undefined} aria-label={`${t.name}${on ? " (현재)" : ""}`} className={`group flex flex-col items-center w-[52px] sm:w-14 py-1 rounded-2xl transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-95 ${focusRing}`}>
                {/* 세틀라이트 툴은 앱 아이콘, 그 밖의 제품(Drive 등)은 아이콘 파일이 없어 기호로 */}
                {SATELLITE_KEYS.has(t.key) ? (
                  <img src={`/satellite/${t.key}_app.svg`} alt="" width={40} height={40} className={`w-10 h-10 rounded-[12px] ${on ? "shadow-[0_8px_18px_-8px_rgba(5,0,114,0.7)] ring-2 ring-navy/20" : "opacity-80 group-hover:opacity-100"}`} aria-hidden="true" />
                ) : (
                  <span className={`w-10 h-10 rounded-[12px] bg-navy text-white flex items-center justify-center ${on ? "shadow-[0_8px_18px_-8px_rgba(5,0,114,0.7)] ring-2 ring-navy/20" : "opacity-80 group-hover:opacity-100"}`} aria-hidden="true"><IconFolder size={19} stroke={1.9} /></span>
                )}
                <span className={`text-[10px] font-semibold mt-1 ${on ? "text-navy" : "text-gray-500"}`}>{t.name}</span>
              </button>
            </li>
          );
        })}
        {libra && (
          <>
            <li aria-hidden="true" className="w-px h-8 bg-black/[0.08] mx-1 mb-3 shrink-0" />
            <li className="relative shrink-0">
              <button type="button" onClick={talk} aria-label={`리브라랑 대화하기 — #${libra.channel} 에서 @Libra 태그`} className={`group flex flex-col items-center w-[64px] sm:w-[72px] py-1 rounded-2xl transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-95 ${focusRing}`}>
                <span className="w-10 h-10 rounded-[12px] bg-[linear-gradient(135deg,#7FE9CB,#2BBE9B)] text-white flex items-center justify-center shadow-[0_8px_18px_-8px_rgba(18,131,106,0.75)]"><IconMessageChatbot size={19} stroke={1.9} aria-hidden="true" /></span>
                <span className="text-[10px] font-semibold text-libra-deep mt-1 whitespace-nowrap">리브라랑 대화</span>
              </button>
              {copied && <span role="status" className="absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-white bg-libra-deep rounded-lg px-2.5 py-1.5 shadow-lg">@Libra 태그 복사됨 · #{libra.channel} 에 붙여넣고 질문하세요</span>}
            </li>
          </>
        )}
      </ul>
    </nav>
  );
}


/** 사이드바 한 줄 — 묶음 안팎이 같은 모양이라 한 곳에서 그린다. */
function NavLeaf({ n, on, badge, onSelect, nested }: { n: ToolNavItem; on: boolean; badge?: number; onSelect: (key: string) => void; nested?: boolean }) {
  const Icon = NAV_ICON[n.key] ?? IconLayoutGrid;
  /* 폰의 가로 메뉴줄에서 지금 탭이 화면 밖이면 보이게 민다 — 탭이 바뀔 때만 (0929) */
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = btn.current, row = el?.closest("ul.overflow-x-auto") as HTMLElement | null;
    if (!on || !el || !row || window.innerWidth >= 768) return;
    // 처음 그릴 때는 메뉴가 다 안 채워져 밀 거리가 없다 — 자리 잡는 동안 몇 번 더 맞춘다.
    const center = () => {
      const x = el.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
      row.scrollLeft = Math.max(0, x - row.clientWidth / 2 + el.clientWidth / 2);
    };
    const timers = [0, 150, 600, 1500].map((ms) => setTimeout(center, ms));
    return () => timers.forEach(clearTimeout);
  }, [on]);
  return (
    <li className="shrink-0 md:shrink">
      {n.sepBefore && <div className="hidden md:block h-px bg-black/[0.06] my-1.5 mx-2" aria-hidden="true" />}
      <button
        type="button"
        onClick={() => onSelect(n.key)}
        aria-current={on ? "page" : undefined}
        ref={btn}
        className={`w-full flex items-center gap-2.5 h-9 px-3 rounded-[10px] text-[13px] font-semibold whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 touch-manipulation ${focusRing} ${
          on ? (ACCENT[n.key] ?? ACCENT_DEFAULT) : "text-gray-600 hover:bg-navy/[0.05] hover:text-gray-900"
        }`}
      >
        <Icon size={nested ? 16 : 18} stroke={1.75} className={on ? "text-white/90" : "text-gray-400"} aria-hidden="true" />
        {n.label}
        {badge ? <span className={`ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center ${on ? "bg-white/20 text-white" : "bg-red-50 text-red-600"}`} aria-label={`${badge}건`}>{badge}</span> : null}
      </button>
    </li>
  );
}
