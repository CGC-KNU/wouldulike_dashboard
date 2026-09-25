"use client";

import { createContext, useContext, useEffect, useState } from "react";

type ViewMode = "mobile" | "pc";

interface ViewModeCtx {
  mode: ViewMode;
  toggle: () => void;
}

const ViewModeContext = createContext<ViewModeCtx>({
  mode: "mobile",
  toggle: () => {},
});

/**
 * PC 레이아웃은 **자리가 있을 때만** 쓴다 (0925).
 *
 * 전에는 저장된 값만 보고 폭을 보지 않았다. 그래서 어쩌다 "pc" 가 저장되면 폰에서도
 * 224px 짜리 사이드바가 화면의 절반을 먹었다. 파트너 화면은 대부분 폰에서 보신다 —
 * 기본은 모바일이고, PC 로 바꾼 사람도 창이 좁아지면 모바일로 돌아온다.
 */
const PC_MIN_WIDTH = 1024;

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<ViewMode>("mobile");
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const v = localStorage.getItem("dashboard_view_mode") as ViewMode | null;
    if (v === "pc" || v === "mobile") setSaved(v);

    const mq = window.matchMedia(`(min-width: ${PC_MIN_WIDTH}px)`);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const mode: ViewMode = saved === "pc" && wide ? "pc" : "mobile";
  const setMode = setSaved;

  function toggle() {
    setMode((v) => {
      const next: ViewMode = v === "mobile" ? "pc" : "mobile";
      localStorage.setItem("dashboard_view_mode", next);
      return next;
    });
  }

  return (
    <ViewModeContext.Provider value={{ mode, toggle }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  return useContext(ViewModeContext);
}
