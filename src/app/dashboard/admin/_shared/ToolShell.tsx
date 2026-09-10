"use client";

import type { ReactNode } from "react";
import {
  IconAlertTriangle,
  IconArrowsExchange,
  IconBuildingStore,
  IconCash,
  IconChartBar,
  IconChevronLeft,
  IconLayoutGrid,
  IconMail,
  IconPhoto,
  IconSettings,
  IconSitemap,
  IconTargetArrow,
  IconActivity,
  IconHome,
  IconDeviceMobile,
  IconFiles,
} from "@tabler/icons-react";
import { focusRing } from "./ui";

/**
 * 세틀라이트 툴 공용 셸 (Astro · Probe · Castor · Aether).
 *
 * 애딧 Pitchr 의 구조를 따른다: 흰 사이드바(아이콘 + 라벨) · 활성 항목만 색 · 하단에 사용자.
 * 예전 네이비 블록 사이드바는 화면 안에서 가장 진한 덩어리라 눈이 먼저 거기로 갔다.
 * 사이드바는 길잡이지 주인공이 아니다. 주인공은 오른쪽 표와 숫자다.
 *
 * Papillon 은 자체 셸(PapillonShell)을 그대로 쓴다 — 아윤·재민이 지금 손대고 있는 화면이라 건드리지 않는다.
 */

export interface ToolNavItem {
  key: string;
  label: string;
}

const NAV_ICON: Record<string, typeof IconBuildingStore> = {
  "astro-home": IconHome,
  "probe-home": IconHome,
  "castor-home": IconHome,
  "probe-app": IconDeviceMobile,
  "astro-ops": IconActivity,
  restaurants: IconBuildingStore,
  "astro-leads": IconTargetArrow,
  "astro-billing": IconCash,
  "astro-docs": IconFiles,
  "probe-metrics": IconChartBar,
  "probe-quality": IconAlertTriangle,
  "castor-map": IconSitemap,
  "castor-experiments": IconArrowsExchange,
  content: IconPhoto,
  notifications: IconMail,
  settings: IconSettings,
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

export default function ToolShell({
  product,
  navItems,
  activeKey,
  onSelect,
  onBack,
  user,
  children,
}: {
  product: { key?: string; name: string; subtitle: string };
  navItems: ToolNavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  onBack?: () => void;
  user: { name: string; role: string };
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-0 md:gap-6 items-start">
      <aside className="md:sticky md:top-4 bg-white/70 rounded-2xl border border-black/[0.05] overflow-hidden">
        {/* 제품 표시 + 런처로 돌아가기 */}
        <div className="px-3 pt-3 pb-2 border-b border-black/[0.05]">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 ${focusRing}`}
            >
              <ToolIcon k={product.key} />
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-gray-900 leading-tight">{product.name}</span>
                <span className="block text-[11px] text-gray-500 leading-tight">{product.subtitle}</span>
              </span>
              <IconChevronLeft size={16} className="ml-auto text-gray-400 shrink-0" aria-hidden="true" />
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
          <ul className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-visible">
            {navItems.map((n) => {
              const Icon = NAV_ICON[n.key] ?? IconLayoutGrid;
              const on = activeKey === n.key;
              return (
                <li key={n.key} className="shrink-0 md:shrink">
                  <button
                    type="button"
                    onClick={() => onSelect(n.key)}
                    aria-current={on ? "page" : undefined}
                    className={`w-full flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors touch-manipulation ${focusRing} ${
                      on ? "bg-navy/[0.08] text-navy" : "text-gray-600 hover:bg-black/[0.04] hover:text-gray-900"
                    }`}
                  >
                    <Icon size={18} stroke={1.75} className={on ? "text-navy" : "text-gray-400"} aria-hidden="true" />
                    {n.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="hidden md:flex items-center gap-2.5 px-4 py-3 border-t border-black/[0.05]">
          <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 text-[12px] font-bold flex items-center justify-center shrink-0">
            {user.name.slice(0, 1)}
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-gray-900 truncate">{user.name}</span>
            <span className="block text-[11px] text-gray-500 truncate">{user.role}</span>
          </span>
        </div>
      </aside>

      <main className="min-w-0 mt-4 md:mt-0">{children}</main>
    </div>
  );
}
