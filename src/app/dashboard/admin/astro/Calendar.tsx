"use client";

import { useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { Lead, StoreRow } from "@/lib/draft/types";
import { isPaidTier } from "@/lib/draft/types";
import { focusRing, todayLocal } from "../_shared/ui";

/**
 * 영업 홈 캘린더 — 미팅 · 기한 · 계약 시작 · 입금 예정을 한 달에 놓는다 (민열님 0911).
 *
 * 입금 예정일은 계약 시작일의 '일'을 매달 반복한다(대부분 1일). 청구 시작 월(`billing_start_period`) 전에는 찍지 않는다.
 * 시트 날짜는 "8/6(목) 14시" 같은 자유 서식이라 느슨하게 읽는다 — 못 읽으면 조용히 빠진다(지어내지 않는다).
 */

export type CalEvent = { date: string; kind: "meeting" | "due" | "contract" | "payment"; label: string; sub?: string; onClick?: () => void };

const KIND: Record<CalEvent["kind"], { label: string; dot: string; chip: string }> = {
  meeting: { label: "미팅", dot: "bg-navy", chip: "bg-navy/10 text-navy" },
  due: { label: "기한", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-800" },
  contract: { label: "계약 시작", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800" },
  payment: { label: "입금 예정", dot: "bg-periwinkle", chip: "bg-periwinkle/15 text-navy" },
};

/** "2026-09-04" · "9/4" · "9월 4일" · "8/6(목) 14시" → YYYY-MM-DD (연도 없으면 기준 연도). */
export function parseLoose(s: string | null | undefined, year: number): string | null {
  if (!s) return null;
  let m = s.match(/(\d{4})[-./]\s?(\d{1,2})[-./]\s?(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/(\d{1,2})\s*[/월]\s*(\d{1,2})/);
  if (m && Number(m[1]) <= 12 && Number(m[2]) <= 31) return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

export function buildEvents(stores: StoreRow[], leads: Lead[], ym: string, onStore: (id: number) => void, onLead: (id: string) => void): CalEvent[] {
  const [y, m] = ym.split("-").map(Number);
  const out: CalEvent[] = [];
  for (const l of leads) {
    if (["재컨택", "보류", "거절", "계약 완료"].includes(l.stage)) continue;
    const mt = parseLoose(l.meeting_at, y); if (mt) out.push({ date: mt, kind: "meeting", label: l.name, sub: l.meeting_at ?? undefined, onClick: () => onLead(l.id) });
    const du = parseLoose(l.due, y); if (du) out.push({ date: du, kind: "due", label: l.name, sub: l.next_action ?? undefined, onClick: () => onLead(l.id) });
  }
  for (const s of stores) {
    if (!s.is_affiliate || s.ops?.is_test) continue;
    const start = parseLoose(s.ops?.contract_started_on, y);
    if (start) out.push({ date: start, kind: "contract", label: s.name, sub: "파트너 계약 시작", onClick: () => onStore(s.restaurant_id) });
    // 월납 유료 매장 — 계약 시작일의 '일'을 매달, 청구 시작 월부터
    if (isPaidTier(s.tier) && s.ops?.pay_cycle !== "LUMP" && s.ops?.billing !== "EXEMPT") {
      const billingStart = s.ops?.billing_start_period ?? (start ? start.slice(0, 7) : null);
      if (billingStart && ym < billingStart) continue;
      const day = start ? Number(start.slice(8, 10)) : 1;
      const last = new Date(y, m, 0).getDate();
      out.push({ date: `${ym}-${String(Math.min(day, last)).padStart(2, "0")}`, kind: "payment", label: s.name, sub: s.ops?.monthly_fee ? `${s.ops.monthly_fee.toLocaleString()}원` : "월 이용료 미입력", onClick: () => onStore(s.restaurant_id) });
    }
  }
  return out.filter((e) => e.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date));
}

export default function Calendar({ events, ym, onMonth }: { events: CalEvent[]; ym: string; onMonth: (ym: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const lead = first.getDay();
  const today = todayLocal();
  const byDay = useMemo(() => { const map = new Map<string, CalEvent[]>(); for (const e of events) { if (!map.has(e.date)) map.set(e.date, []); map.get(e.date)!.push(e); } return map; }, [events]);
  const shift = (k: number) => { const d = new Date(y, m - 1 + k, 1); onMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); setSel(null); };
  const list = sel ? byDay.get(sel) ?? [] : events.filter((e) => e.date >= today).slice(0, 8);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={() => shift(-1)} aria-label="이전 달" className={`w-8 h-8 rounded-lg hover:bg-black/[0.04] flex items-center justify-center text-gray-600 ${focusRing}`}><IconChevronLeft size={16} aria-hidden="true" /></button>
          <span className="text-[13px] font-semibold text-gray-900">{y}년 {m}월</span>
          <button type="button" onClick={() => shift(1)} aria-label="다음 달" className={`w-8 h-8 rounded-lg hover:bg-black/[0.04] flex items-center justify-center text-gray-600 ${focusRing}`}><IconChevronRight size={16} aria-hidden="true" /></button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-gray-400 mb-1">{["일", "월", "화", "수", "목", "금", "토"].map((d) => <span key={d}>{d}</span>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: lead }).map((_, i) => <span key={`e${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const d = `${ym}-${String(i + 1).padStart(2, "0")}`;
            const ev = byDay.get(d) ?? [];
            const on = sel === d;
            return (
              <button key={d} type="button" onClick={() => setSel(on ? null : d)} aria-label={`${m}월 ${i + 1}일${ev.length ? ` · ${ev.length}건` : ""}`} aria-pressed={on}
                className={`h-12 rounded-lg border text-left px-1.5 pt-1 transition-colors ${focusRing} ${on ? "border-navy bg-navy/[0.06]" : d === today ? "border-navy/40 bg-white" : "border-black/[0.05] bg-white hover:bg-navy/[0.03]"}`}>
                <span className={`text-[11px] tabular-nums ${d === today ? "font-bold text-navy" : "text-gray-700"}`}>{i + 1}</span>
                <span className="flex gap-0.5 mt-1 flex-wrap">{ev.slice(0, 4).map((e, k) => <span key={k} className={`w-1.5 h-1.5 rounded-full ${KIND[e.kind].dot}`} />)}{ev.length > 4 && <span className="text-[9px] text-gray-400 leading-none">+{ev.length - 4}</span>}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-gray-500">{(Object.keys(KIND) as CalEvent["kind"][]).map((k) => <span key={k} className="inline-flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${KIND[k].dot}`} />{KIND[k].label}</span>)}</div>
      </div>
      <div>
        <p className="text-[12px] font-semibold text-gray-700 mb-2">{sel ? `${Number(sel.slice(5, 7))}월 ${Number(sel.slice(8))}일` : "다가오는 일정"}</p>
        {list.length === 0 ? <p className="text-[13px] text-gray-500">{sel ? "이 날은 비어 있습니다." : "이번 달 남은 일정이 없습니다."}</p> : (
          <ul className="divide-y divide-gray-100">
            {list.map((e, i) => (
              <li key={i}>
                <button type="button" onClick={e.onClick} className={`w-full flex items-center gap-2.5 py-2 text-left rounded-md ${focusRing}`}>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${KIND[e.kind].chip}`}>{KIND[e.kind].label}</span>
                  <span className="flex-1 min-w-0"><span className="block text-[13px] font-semibold text-gray-900 truncate">{e.label}</span>{e.sub && <span className="block text-[11px] text-gray-500 truncate">{e.sub}</span>}</span>
                  <span className="text-[12px] text-gray-500 tabular-nums">{Number(e.date.slice(5, 7))}/{Number(e.date.slice(8))}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
