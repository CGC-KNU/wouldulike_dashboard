"use client";

import type { ReactNode } from "react";

import ToolShell from "./_shared/ToolShell";

/**
 * 제품 사이드바 셸 — 지금은 Aether(관리 및 운영)가 쓴다.
 *
 * 원래는 Papillon 의 네이비 사이드바를 뽑아낸 것이었다(RD 요청 2026-08-28).
 * 0914 민열님 요청으로 **Astro·Probe 와 같은 사이드바(ToolShell)로 통일**했다 —
 * 화면 안에서 가장 진한 덩어리가 사이드바라 눈이 먼저 거기로 갔다.
 * 사이드바는 길잡이지 주인공이 아니다.
 *
 * **생김새만 바뀐다.** 항목·순서·구분선·선택 동작은 부르는 쪽 그대로다.
 * `icon`(문자) 은 더 이상 쓰지 않는다 — ToolShell 이 키로 아이콘을 고른다.
 * 부르는 쪽 코드를 고치지 않아도 되게 받기만 하고 무시한다.
 */
export interface ProductNavItem {
  key: string;
  label: string;
  icon?: string;
  sepBefore?: boolean;
}

export default function ProductShell({
  navItems,
  activeKey,
  onSelect,
  footer,
  product,
  user,
  onBack,
  children,
}: {
  navItems: ProductNavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** 예전 셸의 사용자 칸. ToolShell 은 `user` 로 그리므로, 없을 때만 쓰는 보조 자리다. */
  footer?: ReactNode;
  product?: { key?: string; name: string; subtitle: string };
  user?: { name: string; role: string };
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <ToolShell
      product={product ?? { name: "세틀라이트", subtitle: "관리 도구" }}
      navItems={navItems.map((n) => ({ key: n.key, label: n.label, sepBefore: n.sepBefore }))}
      activeKey={activeKey}
      onSelect={onSelect}
      onBack={onBack}
      user={user ?? { name: "", role: "" }}
    >
      {/* 떠 있는 도크가 마지막 줄을 가리지 않게. 도크는 메인으로 돌아갈 수 있을 때만 뜬다. */}
      <div className={`min-w-0 max-w-6xl ${onBack ? "pb-24" : ""}`}>{children}</div>
      {!user && footer ? <div className="sr-only">{footer}</div> : null}
    </ToolShell>
  );
}
