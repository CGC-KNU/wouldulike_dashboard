"use client";

import { useViewMode } from "@/contexts/ViewModeContext";
import SideNav from "./SideNav";
import BottomNav from "./BottomNav";

/**
 * `hasHeader` — 관리자가 파트너 뷰로 보고 있어 위에 바가 하나 있는 경우.
 *
 * 사이드바는 `fixed top-0` 이라 그냥 두면 **그 바를 덮는다.** 예전 얇은 띠 때는 덜 티가 났지만
 * 이제 머리가 관리자 화면과 같은 높이라 왼쪽이 통째로 가려진다. 높이만큼 내려서 시작한다.
 */
export default function OwnerNavWrapper({ children, hasHeader = false }: { children: React.ReactNode; hasHeader?: boolean }) {
  const { mode } = useViewMode();

  if (mode === "pc") {
    return (
      <div className="flex min-h-screen">
        <SideNav offsetTop={hasHeader} />
        <main className="flex-1 ml-56 min-w-0">{children}</main>
      </div>
    );
  }

  return (
    <>
      <main className="pb-20">{children}</main>
      <BottomNav />
    </>
  );
}
