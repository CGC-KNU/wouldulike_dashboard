"use client";

import type { ReactNode } from "react";
import type { Flow } from "@/lib/bigquery/liveShape";
import { Card } from "../_shared/ui";

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

/** 접어 두는 칸 — 눌러야 펼쳐진다 */
export function Fold({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group mt-3 border-t border-black/[0.06] pt-2.5">
      <summary className="cursor-pointer select-none list-none text-[12.5px] font-medium text-gray-600 hover:text-gray-900 [&::-webkit-details-marker]:hidden">
        <span className="inline-block w-3 transition-transform group-open:rotate-90">›</span> {label}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
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

/**
 * 「앱 회차 없음」 경고를 띄울 때인가 — 추첨(그날 11:00 KST) **12시간 전부터 마감 때까지**(1022 민찬).
 * 지난 회차는 안 띄운다. 응모는 마감 3일 전에 열려야 하지만, 그보다 일찍부터 띄우면 아직 급하지 않은 회차까지 경고로 남아서다.
 */
export const MISSING_WARN_HOURS = 12;
export function missingAppWarnNow(date: string, nowMs: number = Date.now()): boolean {
  const draw = Date.parse(`${date}T11:00:00+09:00`);
  return nowMs < draw && nowMs >= draw - MISSING_WARN_HOURS * 3600_000;
}

/* ═══════════ 흐름 칸 (1116) — 지표 다섯 화면이 같이 쓴다 ═══════════ */

/** 막대 색 — 지난 칸은 옅게, 지금 칸만 짙게. 표 안 막대는 BAR_INK. 값은 globals.css 변수(다크 모드가 따로 덮는다) */
export const BAR_PAST = "var(--bar-past)";
export const BAR_NOW = "var(--bar-now)";
export const BAR_INK = "var(--bar-ink)";

/** 견준 말 표지 — 많음 ▲ · 비슷 · 적음 ▼. 글에는 화살표를 넣지 않는다(여기서 붙인다) */
export function FlowTag({ flow, children, className = "", small }: { flow: Flow; children: ReactNode; className?: string; small?: boolean }) {
  return (
    <span className={`inline-flex items-center ${small ? "h-5 px-1.5 text-[11px]" : "h-6 px-2 text-[12px]"} rounded-md font-semibold whitespace-nowrap ${className}`} style={{ background: `var(--flow-${flow}-bg)`, color: `var(--flow-${flow}-fg)` }}>
      {flow === "up" ? "▲ " : flow === "down" ? "▼ " : ""}{children}
    </span>
  );
}

/**
 * 흐름 칸 — 제목 · 큰 숫자 · 견준 말 · 보조 줄, 그 아래 그림(children).
 * value 가 null · undefined 면 「미확인」(0 이 아니라 모름). 읽는 중이면 「-」이고 견준 말 · 보조 줄을 비운다.
 */
export function FlowCard({ title, value, unit, tag, sub, loading, children }: {
  title: ReactNode; value: number | string | null | undefined; unit?: string;
  tag?: { flow: Flow; text: ReactNode } | null; sub?: ReactNode; loading?: boolean; children?: ReactNode;
}) {
  const known = !loading && value !== null && value !== undefined;
  const shown = loading ? "-" : !known ? "미확인" : typeof value === "number" ? value.toLocaleString() : value;
  return (
    <Card>
      <p className="text-[13px] font-semibold text-gray-900">{title}</p>
      <div className="flex flex-wrap items-end gap-x-2.5 gap-y-1 mt-2">
        <p className="text-[36px] leading-none font-bold tracking-[-0.03em] tabular-nums text-gray-900">
          {shown}{known && unit && <span className="text-[14px] font-semibold text-gray-400 ml-1">{unit}</span>}
        </p>
        {!loading && tag && <FlowTag flow={tag.flow} className="mb-0.5">{tag.text}</FlowTag>}
      </div>
      <p className="text-[12px] text-gray-500 mt-1.5 truncate">{loading || !sub ? "\u00a0" : sub}</p>
      {children}
    </Card>
  );
}

/** 머리 버튼 옆 「16:48 기준」 — 화면마다 같은 자리(1116 점검 B11). 시각을 모르면 아무것도 그리지 않는다 */
export function AsOf({ at }: { at?: string | null }) {
  if (!at) return null;
  const t = Date.parse(at);
  if (Number.isNaN(t)) return null;
  const k = new Date(t + 9 * 3_600_000).toISOString();
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10) === k.slice(0, 10);
  return <span className="self-center text-[12px] text-gray-500 tabular-nums whitespace-nowrap">{today ? "" : `${+k.slice(5, 7)}/${+k.slice(8, 10)} `}{k.slice(11, 16)} 기준</span>;
}
