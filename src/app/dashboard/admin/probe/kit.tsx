"use client";

import type { ReactNode } from "react";

/**
 * Probe 화면 공통 부품 — 세틀라이트 Probe 목업 수정안(1021 최종본)의 규칙.
 *   · 「모름」은 한 모양 — 회색 면 「미확인」 칩. 0 · 해당 없음(—)과 섞지 않는다.
 *   · 플랜 표지는 반경 6 네모 — Premium(최고 등급) 남색, Boost 페리윙클, 무료는 표지 없음.
 *   · 출처 · 분류는 회색 칩.
 */

/** 못 읽은 값. 0 이 아니라 모름 — 화면 어디서나 같은 모양 */
export function Unknown({ why = "읽지 못한 값입니다 — 0 이 아니라 모름" }: { why?: string }) {
  return <span title={why} className="inline-flex items-center h-5 px-1.5 rounded-md bg-black/[0.06] text-[11px] font-medium text-gray-600 whitespace-nowrap">미확인</span>;
}

/** 이름 옆 플랜 표지. 무료 · 미지정은 표지 없음 */
export function PlanTag({ tier }: { tier: string | null | undefined }) {
  if (tier === "CONTENT") return <span title="Premium — 최고 등급" className="inline-flex items-center h-5 px-1.5 rounded-md bg-[#050072] text-[11px] font-semibold text-white">Premium</span>;
  if (tier === "BOOST") return <span title="Boost" className="inline-flex items-center h-5 px-1.5 rounded-md bg-[#6366E0] text-[11px] font-semibold text-white">Boost</span>;
  return null;
}

/** 출처 · 분류 칩 — 회색 하나 */
export function TagChip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center h-5 px-1.5 rounded-md bg-black/[0.05] text-[11px] font-medium text-gray-600 whitespace-nowrap">{children}</span>;
}

/**
 * 딥링크 인자 한 번 읽고 버리기 — 홈 「오늘 할 일」 같은 곳에서 `?stage=make` 처럼 넘긴 값을
 * 화면이 처음 열릴 때 한 번만 쓴다. 안 지우면 다른 메뉴로 갔다 와도 그 필터가 남는다.
 */
export function takeParam(name: string): string | null {
  try {
    const url = new URL(window.location.href);
    const v = url.searchParams.get(name);
    if (v !== null) { url.searchParams.delete(name); window.history.replaceState(null, "", url.toString()); }
    return v;
  } catch { return null; }
}

export const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
export const WEEKDAY = "일월화수목금토";
export const weekdayOf = (iso: string) => WEEKDAY[new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay()];
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000);
/** 마일리지 응모는 마감 3일 전에 열린다 */
export const openDateOf = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 3 * 86400000).toISOString().slice(0, 10);

/**
 * 정합성 항목을 누가 고치는가 — 영업(후보 방치) · 개발(앱 캠퍼스 칸 비어 있음 — 코드로 채움) · 그 밖은 운영.
 * 같은 건을 두 사람이 고치지 않게 묶음 머리에 담당을 적는다(1022 목업).
 */
export type Owner = "영업" | "운영" | "개발";
export const OWNERS: Owner[] = ["영업", "운영", "개발"];
export const ownerOf = (i: { rule: string }): Owner => (i.rule === "APP_CAMPUS_MISSING" ? "개발" : i.rule === "LEAD_STALE" ? "영업" : "운영");
