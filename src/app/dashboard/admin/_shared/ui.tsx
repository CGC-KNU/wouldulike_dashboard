"use client";

import type { ReactNode } from "react";

/**
 * Astro·Probe·Castor 가 같이 쓰는 작은 조각들.
 *
 * Papillon 이 먼저 굳힌 시각 문법을 그대로 따른다 — 흰 카드 `rounded-2xl shadow-sm`,
 * 마이크로 라벨 `text-[10px] text-gray-400`, 강조는 navy, 인터랙션은 periwinkle.
 * 새 문법을 만들지 않는 게 목적이다. 툴이 늘어날수록 이게 흔들리면 한 제품처럼 안 보인다.
 */

/* ─── 초안 배지 ───────────────────────────────────────
   실데이터와 초안 데이터가 한 화면에 섞이는 구간이 있다. 섞이는 것 자체는 괜찮지만
   **어느 쪽인지 모르는 게** 문제다. 그래서 초안이면 반드시 이 배지가 붙는다. */
export function DraftBadge({ note }: { note?: string }) {
  return (
    <span
      title={note}
      className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden="true" />
      초안 데이터
    </span>
  );
}

/* ─── KPI ─────────────────────────────────────────────
   ADIT Pitchr 대시보드에서 가장 잘 훔칠 것: **총량이 아니라 지금 막힌 것**을 띄운다.
   "전체 식당 34" 는 아무 행동도 못 만들지만 "입금 미확인 7" 은 오늘 할 일이 된다.
   `tone="alert"` 는 0보다 클 때만 빨강이 된다 — 항상 빨갛면 아무도 안 본다. */
export function Kpi({
  label,
  value,
  suffix,
  tone = "plain",
  hint,
  onClick,
  active,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  tone?: "plain" | "alert" | "good";
  hint?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const isAlert = tone === "alert" && typeof value === "number" && value > 0;
  const valueColor = isAlert ? "text-red-600" : tone === "good" ? "text-emerald-600" : "text-navy";
  const ring = active ? "ring-2 ring-periwinkle" : "ring-1 ring-transparent";

  const inner = (
    <>
      <p className="text-[10px] text-gray-400 truncate">{label}</p>
      <p className={`text-xl font-bold mt-0.5 tabular-nums ${valueColor}`}>
        {value}
        {suffix && <span className="text-[11px] font-semibold text-gray-400 ml-0.5">{suffix}</span>}
      </p>
      {hint && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{hint}</p>}
    </>
  );

  return onClick ? (
    <button
      onClick={onClick}
      className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation bg-white rounded-2xl px-3.5 py-3 shadow-sm text-left hover:bg-gray-50 transition-colors ${ring}`}
    >
      {inner}
    </button>
  ) : (
    <div className={`bg-white rounded-2xl px-3.5 py-3 shadow-sm ${ring}`}>{inner}</div>
  );
}

/* ─── 카드 ─── */
export function Card({
  title,
  desc,
  right,
  children,
  padded = true,
}: {
  title?: string;
  desc?: string;
  right?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {(title || right) && (
        <div className="px-4 py-3 border-b border-gray-50 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-gray-700">{title}</h2>}
            {desc && <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </div>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </div>
  );
}

/* ─── 세그먼트 토글 (테이블 ⇄ 칸반 등) ─── */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[11px] font-semibold px-3 py-1.5 rounded-md transition-colors ${
            value === o.key ? "bg-white text-navy shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─── 상태 칩 ─── */
export function Chip({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: "gray" | "green" | "amber" | "red" | "indigo" | "blue";
}) {
  const map = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-50 text-red-600",
    indigo: "bg-indigo-100 text-indigo-700",
    blue: "bg-blue-50 text-blue-700",
  } as const;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${map[tone]}`}>
      {children}
    </span>
  );
}

/* ─── 로딩 / 빈 상태 ───────────────────────────────────
   빈 상태에 "데이터가 없습니다"만 쓰지 않는다. **왜 비었는지와 다음 행동**을 같이 준다.
   Papillon 에서 팀원들이 가장 많이 막혔던 지점이라 처음부터 규칙으로 박아 둔다. */
export function Spinner() {
  return (
    <div className="flex items-center justify-center py-10" role="status" aria-label="불러오는 중…">
      <div className="w-5 h-5 border-2 border-periwinkle border-t-transparent rounded-full animate-spin motion-reduce:animate-none" aria-hidden="true" />
    </div>
  );
}

export function Empty({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm font-semibold text-gray-600 text-balance">{title}</p>
      {detail && <p className="text-[11px] text-gray-400 mt-1 max-w-md mx-auto leading-relaxed">{detail}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ─── 인라인 편집 필드 ─── */
export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold text-gray-400">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const inputCls =
  "w-full text-xs px-2.5 py-1.5 bg-white text-gray-800 border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle focus-visible:ring-2 focus-visible:ring-periwinkle/40";

/** 며칠 전인지. 방치 감지·최근 접촉 표시에 두루 쓴다. */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export function agoLabel(iso: string | null | undefined): string {
  const d = daysSince(iso);
  if (d === null) return "기록 없음";
  if (d === 0) return "오늘";
  if (d === 1) return "어제";
  return `${d}일 전`;
}
