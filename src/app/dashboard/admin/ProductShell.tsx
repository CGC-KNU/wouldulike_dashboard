"use client";

import type { ReactNode } from "react";

/**
 * Papillon(마케팅 툴, PapillonShell.tsx) 사이드바 셸을 다른 제품에서도 쓸 수 있게 뽑아낸
 * 일반화 버전. Aether(관리 및 운영)·Astro(영업 툴) 기본 레이아웃을 마케팅 툴 기준으로
 * 맞춰달라는 RD 요청(2026-08-28)으로 도입 — 기존에는 이 두 제품만 사이드바 없이 평평한
 * 필 탭바(또는 탭이 1개면 그마저도 없이) 콘텐츠를 바로 보여줬다.
 */
export interface ProductNavItem {
  key: string;
  label: string;
  icon: string;
  sepBefore?: boolean;
}

export default function ProductShell({
  navItems,
  activeKey,
  onSelect,
  footer,
  children,
}: {
  navItems: ProductNavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 items-start">
      <aside className="bg-navy rounded-2xl p-3 md:p-4 md:sticky md:top-4">
        <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
          {navItems.map((n) => (
            <div key={n.key} className="contents">
              {n.sepBefore && <div className="hidden md:block h-px bg-white/10 my-1.5" />}
              <button
                onClick={() => onSelect(n.key)}
                className={`flex items-center gap-2.5 text-left text-xs font-semibold rounded-lg px-3 py-2.5 whitespace-nowrap transition-colors ${
                  activeKey === n.key ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="w-4 text-center opacity-85">{n.icon}</span>
                {n.label}
              </button>
            </div>
          ))}
        </div>
        {footer && <div className="hidden md:block mt-4 pt-4 border-t border-white/10">{footer}</div>}
      </aside>

      <main className="min-w-0 max-w-6xl">{children}</main>
    </div>
  );
}
