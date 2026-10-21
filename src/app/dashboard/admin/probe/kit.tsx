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

/** 백엔드가 아직 안 세는 칸(옛 배포) — 못 읽은 「미확인」과 다르다. 0 이 아니다 */
export function Pending() {
  return <span title="이 칸을 세는 백엔드가 아직 배포되지 않았습니다 — 0 이 아니라 집계 전" className="inline-flex items-center h-5 px-1.5 rounded-md bg-black/[0.04] text-[11px] font-medium text-gray-500 whitespace-nowrap">집계 전</span>;
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
const taken = new Map<string, { v: string; t: number }>();
export function takeParam(name: string): string | null {
  try {
    // 개발 모드(StrictMode)는 초기값 함수를 두 번 부른다 — 첫 호출이 지웠어도 같은 값을 돌려준다
    const hit = taken.get(name);
    if (hit && Date.now() - hit.t < 2000) return hit.v;
    const url = new URL(window.location.href);
    const v = url.searchParams.get(name);
    if (v !== null) { taken.set(name, { v, t: Date.now() }); url.searchParams.delete(name); window.history.replaceState(null, "", url.toString()); }
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

/**
 * 패널 구역 — 제목이 그 아래 칸 이름(12px)보다 약하던 위계를 바로잡았다(1022 목업): 구역 제목 15px 굵게 · 칸 이름 12px.
 * 공용 PanelSection(Astro 도 씀)은 그대로 두고 Probe 패널만 이걸 쓴다.
 */
export function PanelSection({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[15px] font-semibold text-gray-900 tracking-[-0.01em]">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** 패널 안 지표 상자 — 테두리 없이 옅은 면 */
export function MetricBox({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-[10px] bg-[#F6F7FF] px-3 py-2">
      <p className="text-[12px] text-gray-600">{label}</p>
      <p className="text-[20px] font-bold tabular-nums text-gray-900 leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-gray-500 tabular-nums">{sub}</p>}
    </div>
  );
}
