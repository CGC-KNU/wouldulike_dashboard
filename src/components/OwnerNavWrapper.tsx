"use client";

import { useViewMode } from "@/contexts/ViewModeContext";
import SideNav from "./SideNav";
import BottomNav from "./BottomNav";

export default function OwnerNavWrapper({ children }: { children: React.ReactNode }) {
  const { mode } = useViewMode();

  if (mode === "pc") {
    return (
      <div className="flex min-h-screen">
        <SideNav />
        <main className="flex-1 ml-56">{children}</main>
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
