"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { defaultMonthlyFee } from "@/lib/draft/pricing";
import type { StoreMetric, StoreRow } from "@/lib/draft/types";
import { fetchJson } from "./fetchJson";
import { focusRing } from "./ui";

/**
 * 메인 「현황」 — 목표 대비 (1121 민열님: "데이터 현황도 '목표 대비' 기준으로, 목표는 버튼 눌러 팝업으로").
 *
 * 목표 숫자는 운영 로드맵 26-28 v2 「학기 숫자 한 장」 — 실적 · 목표라 이 저장소(공개)에 두지 않고 백엔드 home:goals 에서 읽는다.
 * 표에서 key 가 있는 줄만 메인 칸이 되고, 지금 값은 여기서 직접 센다:
 *   paid 유료 매장 · contracted 계약 매장(무료 포함) · users 실사용자(누적 가입) · store100 · store300 이번 달 쿠폰 + 스탬프가
 *   100 · 300건 넘은 매장 · revenue 월 구독 매출(유료 매장 월 이용료 합 — 매장에 적은 값, 없으면 정가)
 * 셀 수 없는 줄(유지율 · 교차 사용 · 업종 · 완성 상권)은 「목표 보기」 표에만 있다. 못 읽은 값은 0 이 아니라 「—」.
 */

interface GoalRow { key: string; label: string; values: string[]; target: number | null; unit: string }
interface Goals { columns: string[]; focus: number; note?: string; rows: GoalRow[]; updated_at?: string }

const nf = new Intl.NumberFormat("ko-KR");
const tile = `bg-white/85 backdrop-blur rounded-[16px] border border-white/70 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_14px_30px_-26px_rgba(5,0,114,0.5)]`;
const fmt = (v: number, unit: string) => (unit === "원" ? (v >= 10_000 ? `${Math.round(v / 1000) / 10}만` : nf.format(v)) : nf.format(v));
const GO: Record<string, string> = { paid: "astro-ops", contracted: "astro-ops", users: "probe-app", store100: "probe-metrics", store300: "probe-metrics", revenue: "astro-billing" };

export default function HomeGoals({ stores, metrics, users, onGo }: {
  stores: StoreRow[] | null; metrics: StoreMetric[] | null | undefined; users: number | undefined; onGo: (t: string) => void;
}) {
  const [goals, setGoals] = useState<Goals | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  useEffect(() => { fetchJson<Goals>("/api/goals").then((g) => setGoals(g && g.rows ? g : null)); }, []);

  const now = useMemo<Record<string, number | undefined>>(() => {
    const live = (stores ?? []).filter((s) => s.is_affiliate && !s.ops?.is_test);
    const paid = live.filter((s) => s.tier === "BOOST" || s.tier === "CONTENT");
    const use = (m: StoreMetric) => m.coupon_redeemed_this_month + m.stamp_earned_this_month;
    const known = (metrics ?? []).filter((m) => !m.unavailable && m.is_affiliate);
    return {
      paid: stores ? paid.length : undefined,
      contracted: stores ? live.length : undefined,
      users,
      store100: metrics ? known.filter((m) => use(m) >= 100).length : undefined,
      store300: metrics ? known.filter((m) => use(m) >= 300).length : undefined,
      revenue: stores ? paid.reduce((a, s) => a + (s.ops?.monthly_fee ?? defaultMonthlyFee(s.tier, s.ops?.campus ?? null) ?? 0), 0) : undefined,
    };
  }, [stores, metrics, users]);

  const focusCol = goals?.columns?.[goals.focus] ?? "";
  const cards = (goals?.rows ?? []).filter((r) => r.key && r.target !== null && r.key in now);

  return (
    <>
      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <h2 className="text-[15px] font-bold text-gray-900 tracking-[-0.01em]">
          현황 <span className="ml-1 text-[12px] font-medium text-gray-500">{focusCol ? `목표 대비 — ${focusCol} 기준` : goals === null ? "목표를 읽지 못했습니다" : "목표 읽는 중…"}</span>
        </h2>
        <div className="flex items-center gap-3 shrink-0">
          <button type="button" onClick={() => setOpen(true)} disabled={!goals} className={`text-[12px] font-semibold text-navy hover:underline rounded disabled:text-gray-400 ${focusRing}`}>목표 보기 →</button>
          <button type="button" onClick={() => onGo("probe-home")} className={`text-[12px] font-semibold text-navy hover:underline rounded ${focusRing}`}>Probe 열기 →</button>
        </div>
      </div>
      <div className="sat-stagger grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {(cards.length ? cards : Array.from({ length: 6 }, (_, i) => ({ key: `s${i}`, label: "", values: [], target: null, unit: "" } as GoalRow))).map((r) => {
          const v = now[r.key];
          const pct = v !== undefined && r.target ? Math.min(100, Math.round((v / r.target) * 100)) : null;
          return (
            <button key={r.key} type="button" onClick={() => GO[r.key] && onGo(GO[r.key])} className={`${tile} px-3.5 py-3 text-left min-w-0 hover:-translate-y-0.5 transition-transform duration-200 motion-reduce:transition-none ${focusRing}`}>
              <span className="block text-[12px] font-semibold text-gray-500 truncate">{r.label || " "}</span>
              <span className="mt-1 flex items-baseline gap-1 min-w-0">
                <span className="text-[22px] font-bold text-gray-900 tabular-nums tracking-[-0.02em] leading-none">{v === undefined ? "—" : fmt(v, r.unit)}</span>
                {r.target !== null && <span className="text-[12px] font-semibold text-gray-500 tabular-nums truncate">/ {fmt(r.target, r.unit)}{r.unit}</span>}
              </span>
              <span className="mt-2 block h-1.5 rounded-full bg-black/[0.06] overflow-hidden" aria-hidden="true">
                <span className={`block h-full rounded-full ${pct !== null && pct >= 100 ? "bg-emerald-500" : "bg-[#3B37C8]"}`} style={{ width: `${pct ?? 0}%` }} />
              </span>
              <span className="mt-1 block text-[11px] text-gray-500 tabular-nums">{pct === null ? " " : `목표의 ${pct}%`}</span>
            </button>
          );
        })}
      </div>
      {open && goals && <GoalsModal goals={goals} now={now} onClose={() => setOpen(false)} />}
    </>
  );
}

/** 「학기 숫자 한 장」 표 그대로 + 맨 앞에 「지금(실시간)」 — 셀 수 있는 줄만 채운다. 기준 열은 초록으로 */
function GoalsModal({ goals, now, onClose }: { goals: Goals; now: Record<string, number | undefined>; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] grid place-items-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="학기 목표" className="w-full max-w-[980px] max-h-[88vh] overflow-auto bg-white rounded-[18px] shadow-2xl">
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-black/[0.06] flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.12em] text-[#9A7B3E]">SEMESTER NUMBERS</p>
            <h2 className="text-[19px] font-bold text-gray-900 mt-0.5">학기 숫자 한 장 — 여기 걸리면 다음 단계를 연다</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className={`w-8 h-8 rounded-lg text-gray-500 hover:bg-black/[0.05] ${focusRing}`}>✕</button>
        </div>
        <div className="p-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px] border-collapse">
            <thead>
              <tr className="bg-[#1F2A24] text-white">
                <th scope="col" className="text-left px-3 py-2.5 rounded-tl-[10px]"> </th>
                <th scope="col" className="px-3 py-2.5 font-semibold text-[#9FE3C6]">지금 (세틀라이트)</th>
                {goals.columns.map((c, i) => <th key={i} scope="col" className={`px-3 py-2.5 font-semibold ${i === goals.columns.length - 1 ? "rounded-tr-[10px]" : ""}`}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {goals.rows.map((r) => {
                const v = r.key ? now[r.key] : undefined;
                return (
                  <tr key={r.label} className="border-b border-black/[0.06]">
                    <th scope="row" className="text-left px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{r.label}</th>
                    <td className="px-3 py-2.5 text-center font-bold text-[#3B37C8] tabular-nums">{v === undefined ? (r.key ? "—" : "") : `${fmt(v, r.unit)}${r.unit === "원" ? "" : r.unit}`}</td>
                    {r.values.map((x, i) => (
                      <td key={i} className={`px-3 py-2.5 text-center tabular-nums ${i === goals.focus ? "bg-emerald-50 font-bold text-emerald-800" : i === goals.focus + 1 ? "bg-emerald-50/50 font-semibold text-emerald-800" : "text-gray-700"}`}>{x}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {goals.note && <p className="mt-3 text-[12px] text-gray-500 leading-relaxed">{goals.note}</p>}
          <p className="mt-1.5 text-[11.5px] text-gray-400">「지금 (세틀라이트)」는 화면이 지금 센 값 — 실사용자는 누적 가입자, 월 100 · 300건은 이번 달 쿠폰 + 스탬프, 월 구독 매출은 유료 매장 월 이용료 합. 메인 칸은 진한 초록 열이 기준입니다.</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
