"use client";

import { useEffect, useState } from "react";

/**
 * 시간으로 정하는 테마 (민열님 0919).
 *
 * 흰색이 기본이다. 시스템 다크 설정은 따르지 않는다 — 낮에 어두운 화면이 떠 있으면 툴이 고장 난 것처럼 보인다.
 * **18:00~06:00** 에 접속하면 스스로 어두워진다. 상단 ☾ 로 언제든 바꿀 수 있고, 손으로 바꾼 건 **그날은** 유지된다
 * (자정이 지나면 다시 시계를 따른다 — 어제 저녁의 선택이 오늘 낮까지 남으면 안 된다).
 *
 * 실제 색은 globals.css 의 [data-theme=dark] 가 맡는다. 여기는 스위치만 올린다.
 */
export type Theme = "light" | "dark";

const KEY = () => `sat-theme-${new Date().toDateString()}`;

export function themeByClock(now = new Date()): Theme {
  const h = now.getHours();
  return h >= 18 || h < 6 ? "dark" : "light";
}

export function readTheme(): Theme {
  try { const m = localStorage.getItem(KEY()); if (m === "dark" || m === "light") return m; } catch { /* 저장소 없음 */ }
  return themeByClock();
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
}

/** 루트 레이아웃에 한 번. 시계를 따라 자동으로, 손으로 바꾼 날은 그 선택으로. */
export default function ThemeClock() {
  useEffect(() => {
    applyTheme(readTheme());
    // 정각을 넘겨도 따라오게 — 손으로 바꾼 날은 건드리지 않는다
    const id = setInterval(() => { try { if (!localStorage.getItem(KEY())) applyTheme(themeByClock()); } catch { applyTheme(themeByClock()); } }, 60_000);
    return () => clearInterval(id);
  }, []);
  return null;
}

/** ☾ / ☀ 토글. 헤더가 쓴다. */
export function useThemeToggle(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => { setTheme(readTheme()); }, []);
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next); applyTheme(next);
    try { localStorage.setItem(KEY(), next); } catch { /* 저장 못 해도 지금은 바뀐다 */ }
  };
  return { theme, toggle };
}
