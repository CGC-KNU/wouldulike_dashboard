"use client";

import { useEffect } from "react";

/** 열람 1회 — 같은 브라우저 세션에서는 한 번만. 크롤러는 JS 를 안 돌리므로 자동으로 빠진다. */
export default function ViewBeacon({ token }: { token: string }) {
  useEffect(() => {
    try {
      const k = `r-viewed-${token}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
      fetch(`/api/r/${token}/view`, { method: "POST", keepalive: true }).catch(() => {});
    } catch { /* 무시 */ }
  }, [token]);
  return null;
}
