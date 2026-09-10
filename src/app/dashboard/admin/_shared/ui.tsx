"use client";

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useEffect } from "react";
import { IconX } from "@tabler/icons-react";

/**
 * Astro·Probe·Castor 공용 UI 키트.
 *
 * 애딧 Pitchr/Console 을 레퍼런스로 삼았다. 그쪽에서 가져온 규칙:
 *   · 본문 13px, 라벨 12px. 10px 는 타임스탬프에만. 팀원이 하루 종일 보는 화면이라 가독성이 먼저다.
 *   · 그림자 대신 1px 선. 흰 표면 + 회색 200 테두리. 카드는 "묶음"일 때만.
 *   · 색은 하나(navy). 활성 메뉴·주 CTA 에만 쓴다. 상태는 색이 아니라 칩 텍스트가 말한다.
 *   · 모서리 규칙: 버튼·입력 8px, 카드·패널 12px, 상태 칩만 pill. 이 셋 외 반지름 없음.
 *   · 총량 KPI 는 없다. "지금 막힌 것"을 띄우고, 빨강은 0 보다 클 때만.
 *   · 상세는 인라인 펼침이 아니라 오른쪽 슬라이드 패널. 목록을 잃지 않는다.
 */

/* ═══════════ 토큰 (문자열로 두는 이유: tailwind JIT 가 정적 문자열만 읽는다) ═══════════ */

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/50 focus-visible:ring-offset-1";

export const surface = "bg-white rounded-[18px] border border-black/[0.05] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-24px_rgba(5,0,114,0.25)]";

/* ═══════════ 버튼 ═══════════ */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-[linear-gradient(180deg,#1512a3_0%,#050072_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_6px_16px_-8px_rgba(5,0,114,0.6)] hover:brightness-110 disabled:bg-gray-300 disabled:bg-none disabled:shadow-none",
  secondary: "bg-black/[0.05] text-gray-800 hover:bg-black/[0.08] disabled:text-gray-400 disabled:bg-black/[0.03]",
  ghost: "bg-transparent text-gray-600 hover:bg-black/[0.05] hover:text-gray-900 disabled:text-gray-300",
  danger: "bg-red-50 text-red-600 hover:bg-red-100",
};
const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-[12px] gap-1.5 rounded-[9px]",
  md: "h-9 px-3.5 text-[13px] gap-2 rounded-[10px]",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: ReactNode }
>(function Button({ variant = "secondary", size = "md", icon, className = "", children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`inline-flex items-center justify-center whitespace-nowrap font-semibold transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100 touch-manipulation disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANT[variant]} ${SIZE[size]} ${focusRing} ${className}`}
      {...rest}
    >
      {icon && <span className="shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
      {children}
    </button>
  );
});

/* ═══════════ 입력 ═══════════ */

const fieldBase =
  "w-full h-9 px-3 text-[13px] text-gray-900 bg-black/[0.05] border border-transparent rounded-[10px] placeholder:text-gray-400 transition-[background-color,box-shadow] duration-150 hover:bg-black/[0.07] focus:bg-white focus:border-navy/40 focus:outline-none focus:ring-4 focus:ring-navy/10 disabled:bg-black/[0.03] disabled:text-gray-400";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...rest },
  ref
) {
  return <input ref={ref} autoComplete="off" spellCheck={false} className={`${fieldBase} ${className}`} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className = "", children, ...rest },
  ref
) {
  return (
    <select ref={ref} className={`${fieldBase} pr-8 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b7280%22 stroke-width=%222.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-no-repeat bg-[right_10px_center] ${className}`} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = "", ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={`${fieldBase} h-auto py-2 leading-relaxed resize-none ${className}`}
        {...rest}
      />
    );
  }
);

/** 라벨은 입력 위에. placeholder 를 라벨로 쓰지 않는다. */
export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {error ? (
        <span className="block text-[12px] text-red-600 mt-1" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="block text-[12px] text-gray-500 mt-1">{hint}</span>
      ) : null}
    </label>
  );
}

/* ═══════════ 상태 칩 ═══════════
   색이 상태를 말하지 않는다. 텍스트가 말하고 색은 거든다. 점(dot)은 "지금 행동이 필요함" 같은
   실제 상태에만 붙인다. 장식용 점은 쓰지 않는다. */

export type ChipTone = "gray" | "green" | "amber" | "red" | "blue" | "navy";

const CHIP: Record<ChipTone, string> = {
  gray: "bg-black/[0.05] text-gray-700",
  green: "bg-emerald-500/10 text-emerald-800",
  amber: "bg-amber-400/15 text-amber-800",
  red: "bg-red-500/10 text-red-700",
  blue: "bg-blue-500/10 text-blue-800",
  navy: "bg-navy/[0.07] text-navy",
};

export function Chip({ children, tone = "gray", dot }: { children: ReactNode; tone?: ChipTone; dot?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[12px] font-medium whitespace-nowrap ${CHIP[tone]}`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** 초안 데이터 배지. 실데이터와 섞이는 화면에서 어느 쪽인지 반드시 보이게 한다. */
export function DraftBadge({ note }: { note?: string }) {
  return (
    <span
      title={note}
      className="inline-flex items-center h-6 px-2 rounded-full bg-amber-400/15 text-amber-800 text-[12px] font-medium whitespace-nowrap"
    >
      초안 데이터
    </span>
  );
}

/* ═══════════ 페이지 헤더 ═══════════
   Pitchr: 왼쪽 H1(+설명), 오른쪽 주 CTA 하나. 필터는 그 아래 한 줄. */

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold text-gray-900 leading-tight tracking-[-0.025em] text-balance">{title}</h1>
          {description && <p className="text-[13.5px] text-gray-500 mt-1.5 max-w-[60ch] leading-relaxed">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/* ═══════════ 필터 알약 (Pitchr 파이프라인 상단의 전사/미배정/담당자) ═══════════ */

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-[9px] border text-[12px] font-semibold transition-[background-color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 touch-manipulation ${focusRing} ${
              on ? "bg-navy text-white border-navy shadow-[0_4px_12px_-6px_rgba(5,0,114,0.6)]" : "bg-black/[0.05] text-gray-700 border-transparent hover:bg-black/[0.08]"
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={`tabular-nums ${on ? "text-white/70" : "text-gray-400"}`}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** 테이블 ⇄ 칸반 같은 뷰 전환. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="inline-flex h-9 p-[3px] bg-black/[0.06] rounded-[10px]" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            className={`inline-flex items-center gap-1.5 px-3 rounded-[8px] text-[12px] font-semibold transition-[background-color,color,box-shadow] duration-150 touch-manipulation ${focusRing} ${
              on ? "bg-white text-navy shadow-[0_1px_3px_rgba(16,24,40,0.12)]" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {o.icon && <span className="[&>svg]:w-4 [&>svg]:h-4">{o.icon}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════ KPI ═══════════
   Pitchr 대시보드: 라벨 / 큰 숫자 / 한 줄 설명. 빨강은 값이 0 보다 클 때만.
   누르면 그 조건으로 목록이 걸러진다. 숫자를 보는 것과 행동하는 것 사이에 클릭 하나. */

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
  const alert = tone === "alert" && typeof value === "number" && value > 0;
  const color = alert ? "text-red-600" : tone === "good" ? "text-emerald-700" : "text-gray-900";
  // 막힌 것은 배경도 아주 옅게 붉다. 숫자 색 하나로는 스캔이 안 된다.
  const wash = alert ? "bg-[linear-gradient(180deg,rgba(239,68,68,0.06),rgba(255,255,255,0))]" : tone === "good" ? "bg-[linear-gradient(180deg,rgba(16,185,129,0.06),rgba(255,255,255,0))]" : "";
  const base = `${surface} ${wash} px-4 py-3.5 text-left min-w-0 transition-[transform,box-shadow] duration-200 ease-out`;
  const inner = (
    <>
      <p className="text-[12px] font-semibold text-gray-500 truncate tracking-[-0.01em]">{label}</p>
      <p className={`text-[28px] font-bold leading-none mt-2 tracking-[-0.03em] tabular-nums ${color}`}>
        {value}
        {suffix && <span className="text-[13px] font-semibold text-gray-400 ml-1">{suffix}</span>}
      </p>
      {hint && <p className="text-[12px] text-gray-500 mt-1 truncate">{hint}</p>}
    </>
  );
  if (!onClick) return <div className={base}>{inner}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${base} hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(5,0,114,0.35)] active:translate-y-0 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${focusRing} ${active ? "ring-2 ring-navy border-transparent" : ""}`}
    >
      {inner}
    </button>
  );
}

/** Console 정산 관리의 단계 타일. 왼→오른쪽으로 흐르는 상태를 한 줄에. */
export function StepTiles({
  steps,
  active,
  onSelect,
}: {
  steps: { key: string; label: string; count: number; hint?: string; tone?: "plain" | "alert" | "good" }[];
  active?: string | null;
  onSelect?: (key: string) => void;
}) {
  return (
    <ol className="flex gap-2 overflow-x-auto pb-1 -mb-1">
      {steps.map((s, i) => {
        const alert = s.tone === "alert" && s.count > 0;
        const on = active === s.key;
        return (
          <li key={s.key} className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onSelect?.(s.key)}
              aria-pressed={on}
              className={`${surface} min-w-[9.5rem] px-3.5 py-3 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(5,0,114,0.35)] motion-reduce:hover:translate-y-0 ${focusRing} ${on ? "ring-2 ring-navy border-transparent" : ""}`}
            >
              <p className="text-[12px] font-medium text-gray-500">{s.label}</p>
              <p className={`text-[22px] font-bold leading-tight mt-0.5 tabular-nums ${alert ? "text-red-600" : s.tone === "good" ? "text-emerald-700" : "text-gray-900"}`}>
                {s.count}
                <span className="text-[12px] font-medium text-gray-400 ml-1">곳</span>
              </p>
              {s.hint && <p className="text-[12px] text-gray-500 mt-0.5 truncate">{s.hint}</p>}
            </button>
            {i < steps.length - 1 && <span className="text-gray-300" aria-hidden="true">›</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ═══════════ 카드 / 섹션 ═══════════ */

export function Card({
  title,
  description,
  actions,
  children,
  flush,
  className = "",
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={`${surface} overflow-hidden ${className}`}>
      {(title || actions) && (
        <header className="px-4 py-3 border-b border-black/[0.06] flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-gray-900 tracking-[-0.01em]">{title}</h2>}
            {description && <p className="text-[12px] text-gray-500 mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

/* ═══════════ 테이블 (Pitchr 리드 목록) ═══════════ */

export function Table({ children, minWidth = "40rem" }: { children: ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] border-collapse" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  width,
  onClick,
  sorted,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  onClick?: () => void;
  sorted?: "asc" | "desc" | null;
}) {
  const cls = `px-3 py-2.5 text-[12px] font-medium text-gray-500 border-b border-black/[0.08] whitespace-nowrap text-${align}`;
  if (!onClick) return <th scope="col" style={{ width }} className={cls}>{children}</th>;
  return (
    <th scope="col" style={{ width }} className={cls} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}>
      <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 hover:text-gray-900 ${focusRing} rounded`}>
        {children}
        <span className={`text-[10px] ${sorted ? "text-navy" : "text-gray-300"}`} aria-hidden="true">
          {sorted === "desc" ? "▼" : "▲"}
        </span>
      </button>
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
  numeric,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  numeric?: boolean;
}) {
  return (
    <td className={`px-3 py-2.5 border-b border-black/[0.05] align-middle text-${align} ${numeric ? "tabular-nums" : ""} ${className}`}>
      {children}
    </td>
  );
}

/** 행 전체가 클릭 대상이면 tr 에 이걸 준다. 키보드로도 열려야 하므로 버튼 하나를 안에 둔다. */
export const rowClickable = "hover:bg-navy/[0.03] cursor-pointer transition-colors duration-100";

/* ═══════════ 상태 ═══════════ */

/** 스피너 대신 최종 레이아웃 모양의 뼈대. 화면이 어디에 무엇이 올지 미리 보여준다. */
export function Skeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="불러오는 중…" className="p-4 space-y-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-4 bg-gray-100 rounded animate-pulse motion-reduce:animate-none"
              style={{ width: c === 0 ? "28%" : `${10 + ((r + c) % 3) * 4}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="py-14 px-6 text-center">
      <p className="text-[14px] font-semibold text-gray-800 text-balance">{title}</p>
      {detail && <p className="text-[13px] text-gray-500 mt-1.5 max-w-[48ch] mx-auto leading-relaxed">{detail}</p>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "amber", title, children }: { tone?: "amber" | "red" | "blue"; title: string; children?: ReactNode }) {
  const map = {
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    red: "bg-red-50 border-red-200 text-red-800",
    blue: "bg-blue-50 border-blue-200 text-blue-900",
  };
  return (
    <div className={`border rounded-xl px-4 py-3 ${map[tone]}`} role={tone === "red" ? "alert" : "status"}>
      <p className="text-[13px] font-semibold">{title}</p>
      {children && <div className="text-[12px] mt-0.5 leading-relaxed opacity-90">{children}</div>}
    </div>
  );
}

/* ═══════════ 슬라이드 패널 (Console 캠페인 상세) ═══════════
   목록을 가리지 않고 오른쪽에서 열린다. ESC 로 닫힌다. 폰에서는 바텀시트가 된다. */

export function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  badge,
  footer,
  children,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  width?: "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-gray-900/25 backdrop-blur-[2px] cursor-default animate-[scrim-in_200ms_ease-out] motion-reduce:animate-none"
      />
      <div
        className={`relative bg-white w-full ${width === "lg" ? "md:w-[36rem]" : "md:w-[28rem]"} max-h-[92vh] md:max-h-none md:h-full flex flex-col rounded-t-2xl md:rounded-none shadow-[0_-8px_40px_-12px_rgba(16,24,40,0.25)] md:shadow-[-8px_0_40px_-12px_rgba(16,24,40,0.25)] animate-[slideover-in_220ms_cubic-bezier(0.23,1,0.32,1)] motion-reduce:animate-none`}
      >
        <header className="px-5 pt-4 pb-3 border-b border-black/[0.06] flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[16px] font-bold text-gray-900 truncate">{title}</h2>
              {badge}
            </div>
            {subtitle && <p className="text-[12px] text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="닫기" icon={<IconX />} />
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-black/[0.06] bg-white/85 backdrop-blur flex items-center gap-2">{footer}</footer>}
      </div>
    </div>
  );
}

/** Console 상세 상단의 단계 표시줄. 지나온 단계는 채우고 현재는 진하게. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex gap-1" aria-label="진행 단계">
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={s} className="flex-1 min-w-0">
            <div className={`h-1.5 rounded-full transition-colors ${done || now ? "bg-navy" : "bg-black/[0.08]"} ${now ? "" : done ? "opacity-50" : ""}`} />
            <p className={`text-[11px] mt-1 truncate ${now ? "text-navy font-semibold" : "text-gray-400"}`} aria-current={now ? "step" : undefined}>
              {s}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/** 상세 패널 안의 "라벨 : 값" 묶음 (Console 상세의 일정/상품 블록). */
export function DefList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-black/[0.05] rounded-xl bg-black/[0.03]">
      {items.map((it) => (
        <div key={it.label} className="flex items-center justify-between gap-4 px-3 py-2">
          <dt className="text-[12px] text-gray-500 shrink-0">{it.label}</dt>
          <dd className="text-[13px] text-gray-900 text-right min-w-0 truncate">{it.value ?? <span className="text-gray-300">-</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 상세 패널 섹션 제목. */
export function PanelSection({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

/* ═══════════ 시간 ═══════════ */

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

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(t);
}
