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

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ViewMode>("mobile");

  useEffect(() => {
    const saved = localStorage.getItem("dashboard_view_mode") as ViewMode | null;
    if (saved === "pc" || saved === "mobile") setMode(saved);
  }, []);

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
