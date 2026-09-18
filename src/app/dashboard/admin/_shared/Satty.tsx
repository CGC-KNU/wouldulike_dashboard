"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SatelliteStatus } from "./useSatelliteStatus";

/**
 * Satty(세티) — 세틀라이트에 같이 사는 위성 (민열님 0919 승인 시안 v4).
 *
 * 기능을 해치지 않는 여백(런처 우하단)에 작게 있다. 숫자가 좋으면 기뻐하고, 막힌 일이 쌓이면
 * 지쳐 보이고, 아무 일 없을 때도 숨을 쉰다. **스스로 말 걸지 않는다** — 눌렀을 때만 한 마디.
 *
 * 생김새: 흰자 없는 점눈 둘 · 연보라 볼 · 아주 작은 입 · 몽글한 팔 둘 · 병뚜껑 안테나.
 * 페리윙클→네이비로 도는 공 하나. 선이 적을수록 귀엽다.
 * 색은 네이비·페리윙클·연보라 셋. 경고는 색이 아니라 **속도**로 낸다(안테나 불빛이 빨라진다).
 *
 * 기분은 **툴이 이미 가진 숫자**로만 정한다. 우선순위 주목 > 피곤 > 기쁨 > 밤 > 숨쉬기, 한 번에 한 기분.
 */

export type Mood = "idle" | "happy" | "tired" | "alert" | "sleep";

export interface MoodResult { mood: Mood; line: string; go?: string }

/** 기분 판정. 근거 한 줄과 그 화면을 같이 돌려준다 — 눌렀을 때 "왜"가 보여야 한다. */
export function moodOf(st: SatelliteStatus | null | undefined, weekItems: number, now = new Date()): MoodResult {
  const h = now.getHours();
  const stale = st?.leads?.stale ?? 0;
  const unpaid = st?.billing?.unpaid ?? 0;
  const pendingApprove = st?.billing?.pendingApprove ?? 0;
  const due = st?.probe?.due ?? 0;
  const held = st?.probe?.held ?? 0;
  const blocked = stale + unpaid + due + held;

  if (stale > 0) return { mood: "alert", line: `7일 넘게 멈춘 후보가 ${stale}곳이에요`, go: "astro-leads" };
  if (unpaid >= 3) return { mood: "alert", line: `미입금이 ${unpaid}곳이에요 — 확인해 볼까요`, go: "astro-billing" };
  if (blocked >= 5 || weekItems >= 10) return { mood: "tired", line: weekItems >= 10 ? `이번 주 일정이 ${weekItems}건… 같이 가요` : `막힌 일이 ${blocked}건이에요, 하나씩`, go: weekItems >= 10 ? "astro-calendar" : "astro-leads" };
  const paidThisMonth = st?.billing?.paid ?? 0;
  const recentContracts = st?.stores?.weeks?.slice(-2).reduce((a, b) => a + b, 0) ?? 0;
  if (paidThisMonth > 0 && (recentContracts > 0 || pendingApprove === 0)) return { mood: "happy", line: `이번 달 입금 ${paidThisMonth}건! 유료 ${st?.stores?.paid ?? 0}곳이에요`, go: "astro-billing" };
  if (h >= 22 || h < 5) return { mood: "sleep", line: "늦었어요, 내일 해도 돼요" };
  return { mood: "idle", line: "오늘도 조용히 돌고 있어요" };
}

/**
 * 커서가 가까이 오면 눈동자가 따라온다. 반경 3px 안에서만 — 더 가면 눈알이 돌아간 것처럼 보인다.
 */
export default function Satty({ status, weekItems = 0, onGo, className = "" }: { status?: SatelliteStatus | null; weekItems?: number; onGo?: (target: string) => void; className?: string }) {
  const res = useMemo(() => moodOf(status, weekItems), [status, weekItems]);
  const [open, setOpen] = useState(false);
  const [pupil, setPupil] = useState({ x: 0, y: 0 });
  const [hidden, setHidden] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 폰에서 스크롤 중엔 숨는다 — 손가락 자리를 뺏지 않는다. 멈추면 돌아온다.
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(min-width: 768px)").matches) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => { setHidden(true); clearTimeout(t); t = setTimeout(() => setHidden(false), 700); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); clearTimeout(t); };
  }, []);

  // 눈동자 — 화면 어디에 커서가 있든 살짝 따라온다
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = ref.current?.getBoundingClientRect(); if (!r) return;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        setPupil({ x: Math.max(-1, Math.min(1, (e.clientX - cx) / 240)) * 2.6, y: Math.max(-1, Math.min(1, (e.clientY - cy) / 240)) * 2.2 });
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => { if (!open) return; const t = setTimeout(() => setOpen(false), 3200); return () => clearTimeout(t); }, [open]);

  return (
    <div ref={ref} data-mood={res.mood}
      className={`satty fixed z-30 right-3 bottom-[76px] md:right-6 md:bottom-6 select-none transition-[opacity,transform] duration-300 ${hidden ? "opacity-0 translate-y-3 pointer-events-none" : "opacity-100"} ${className}`}>
      {open && (
        <div role="status" className="absolute bottom-full right-0 mb-1.5 max-w-[220px] whitespace-nowrap rounded-[12px_12px_4px_12px] bg-navy text-white text-[11.5px] font-medium px-2.5 py-1.5 shadow-[0_8px_20px_-12px_rgba(5,0,114,0.7)]">
          {res.line}{res.go && onGo && <button type="button" onClick={() => onGo(res.go!)} className="ml-1.5 underline underline-offset-2 text-[#C7C9F7]">보기</button>}
        </div>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={`Satty — ${res.line}`} title="Satty"
        className="block w-[44px] h-[44px] md:w-[56px] md:h-[56px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/50 rounded-full">
        <svg viewBox="0 0 160 160" className="satty-svg w-full h-full" aria-hidden="true">
          <defs><radialGradient id="satty-body" cx="40%" cy="30%" r="75%"><stop offset="0" stopColor="#7C7EF0" /><stop offset=".55" stopColor="#4F52DC" /><stop offset="1" stopColor="#2B28B8" /></radialGradient></defs>
          <g className="satty-antenna"><rect x="72" y="34" width="16" height="12" rx="5" fill="#4F52DC" /><circle className="satty-beacon" cx="80" cy="30" r="4.5" fill="#C7C9F7" /></g>
          <g className="satty-wing satty-wing-l"><ellipse cx="36" cy="98" rx="13" ry="10" fill="#9B9DF4" /></g>
          <g className="satty-wing satty-wing-r"><ellipse cx="124" cy="98" rx="13" ry="10" fill="#9B9DF4" /></g>
          <g className="satty-torso">
            <circle cx="80" cy="88" r="46" fill="url(#satty-body)" />
            <ellipse className="satty-blush" cx="52" cy="94" rx="8" ry="5" fill="#B9BBFA" opacity=".85" /><ellipse className="satty-blush" cx="108" cy="94" rx="8" ry="5" fill="#B9BBFA" opacity=".85" />
            <g className="satty-eyes">
              <g transform={`translate(${66 + pupil.x} ${82 + pupil.y})`}><circle className="satty-pupil" r="4.4" fill="#0B0B3A" /></g>
              <g transform={`translate(${94 + pupil.x} ${82 + pupil.y})`}><circle className="satty-pupil" r="4.4" fill="#0B0B3A" /></g>
              <path className="satty-closed" d="M60 82q6 5 12 0M88 82q6 5 12 0" stroke="#0B0B3A" strokeWidth="3" strokeLinecap="round" fill="none" />
              <path className="satty-smile-eye" d="M60 84q6-7 12 0M88 84q6-7 12 0" stroke="#0B0B3A" strokeWidth="3" strokeLinecap="round" fill="none" />
            </g>
            <path className="satty-mouth" d="M77 98q3 3 6 0" stroke="#0B0B3A" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          </g>
          <g className="satty-sparks" fill="#C7C9F7"><path d="M134 44l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /><path d="M22 56l1.4 3.6 3.6 1.4-3.6 1.4L22 66l-1.4-3.6L17 61l3.6-1.4z" /></g>
          <text className="satty-zz" x="122" y="50" fontFamily="inherit" fontWeight="700" fontSize="13" fill="#8C8EF0">z<tspan fontSize="9" dy="-6">z</tspan></text>
        </svg>
      </button>
    </div>
  );
}
