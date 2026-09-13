"use client";

import { useEffect, useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconFileDownload, IconMessage2, IconSearch } from "@tabler/icons-react";
import type { Lead, StoreRow } from "@/lib/draft/types";
import { isPaidTier } from "@/lib/draft/types";
import type { MsgContext } from "@/lib/draft/message";
import { Input, focusRing, todayLocal } from "../_shared/ui";
import MessageComposer from "./MessageComposer";
import DocQuickLinks, { DOC_SETS } from "./DocQuickLinks";

/**
 * 영업 일정 — 미팅 · 기한 · 계약 시작 · 입금 예정을 한 달에 놓는다 (민열님 0911).
 *
 * 실제 데이터는 한 날짜에 몰린다 — 대부분 9월 1일 계약 시작 + 월납. 그래서 점을 40개 찍는 대신
 * **종류별로 묶어 글자로** 보여준다("입금 예정 12곳"). 하루에 한 건이면 매장 이름을 그대로 쓴다.
 *
 * 입금 예정일은 계약 시작일의 '일'을 매달 반복한다(대부분 1일). 청구 시작 월 전에는 찍지 않는다.
 * 시트 날짜는 "8/6(목) 14시" 같은 자유 서식이라 느슨하게 읽고, 못 읽으면 조용히 빠진다(지어내지 않는다).
 */

export type CalKind = "meeting" | "due" | "contract" | "payment";
export type CalEvent = {
  date: string; kind: CalKind; label: string; sub?: string; onClick?: () => void;
  /** 문자 보내기에 필요한 값. 입금·미팅·계약 시작 항목에만 붙는다. */
  msg?: MsgContext;
};

const KIND: Record<CalKind, { label: string; dot: string; chip: string; bar: string }> = {
  meeting: { label: "미팅", dot: "bg-navy", chip: "bg-navy/[0.07] text-navy", bar: "border-l-navy" },
  due: { label: "기한", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-800", bar: "border-l-amber-500" },
  contract: { label: "계약 시작", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800", bar: "border-l-emerald-500" },
  payment: { label: "입금 예정", dot: "bg-periwinkle", chip: "bg-periwinkle/15 text-navy", bar: "border-l-periwinkle" },
};
const ORDER: CalKind[] = ["meeting", "due", "contract", "payment"];

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
    const msg: MsgContext = { name: l.name, targetType: "lead", targetId: l.id, owner: l.owner_name, phone: l.contact ?? l.phone, meetingAt: l.meeting_at, nextAction: l.next_action };
    const mt = parseLoose(l.meeting_at, y); if (mt) out.push({ date: mt, kind: "meeting", label: l.name, sub: l.meeting_at ?? undefined, onClick: () => onLead(l.id), msg });
    const du = parseLoose(l.due, y); if (du) out.push({ date: du, kind: "due", label: l.name, sub: l.next_action ?? undefined, onClick: () => onLead(l.id), msg });
  }
  for (const s of stores) {
    if (!s.is_affiliate || s.ops?.is_test) continue;
    const start = parseLoose(s.ops?.contract_started_on, y);
    const base: MsgContext = { name: s.name, targetType: "store", targetId: String(s.restaurant_id), owner: s.ops?.owner_name, phone: s.ops?.owner_phone, fee: s.ops?.monthly_fee, period: ym };
    if (start) out.push({ date: start, kind: "contract", label: s.name, sub: "파트너 계약 시작", onClick: () => onStore(s.restaurant_id), msg: base });
    if (isPaidTier(s.tier) && s.ops?.pay_cycle !== "LUMP" && s.ops?.billing !== "EXEMPT") {
      const billingStart = s.ops?.billing_start_period ?? (start ? start.slice(0, 7) : null);
      if (billingStart && ym < billingStart) continue;
      const day = start ? Number(start.slice(8, 10)) : 1;
      const last = new Date(y, m, 0).getDate();
      const d = `${ym}-${String(Math.min(day, last)).padStart(2, "0")}`;
      out.push({ date: d, kind: "payment", label: s.name, sub: s.ops?.monthly_fee ? `${s.ops.monthly_fee.toLocaleString()}원` : "월 이용료 미입력", onClick: () => onStore(s.restaurant_id), msg: { ...base, dateLabel: `${Number(d.slice(5, 7))}/${Number(d.slice(8))}` } });
    }
  }
  return out.filter((e) => e.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

export default function Calendar({ events: allEvents, ym, onMonth, actor, onLogged }: { events: CalEvent[]; ym: string; onMonth: (ym: string) => void; actor?: string; onLogged?: () => void }) {
  const [y, m] = ym.split("-").map(Number);
  // 필터 — 종류(미팅/기한/계약 시작/입금 예정)와 식당 이름 (민열님 0911)
  const [kinds, setKinds] = useState<CalKind[]>([...ORDER]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ctx: MsgContext; ev: { kind: CalKind; past: boolean; tomorrow: boolean } } | null>(null);
  const events = useMemo(() => {
    const s = q.trim();
    return allEvents.filter((e) => kinds.includes(e.kind) && (!s || e.label.includes(s)));
  }, [allEvents, kinds, q]);
  const names = useMemo(() => [...new Set(allEvents.map((e) => e.label))].sort((a, b) => a.localeCompare(b, "ko")), [allEvents]);
  const toggle = (k: CalKind) => setKinds((cur) => (cur.includes(k) ? (cur.length === 1 ? cur : cur.filter((x) => x !== k)) : [...cur, k]));
  const days = new Date(y, m, 0).getDate();
  const lead = new Date(y, m - 1, 1).getDay();
  const today = todayLocal();

  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) { if (!map.has(e.date)) map.set(e.date, []); map.get(e.date)!.push(e); }
    return map;
  }, [events]);

  /** 하루에 여러 건이면 종류별로 묶는다 — 점 40개보다 "입금 예정 12곳" 한 줄이 읽힌다. */
  const groupsOf = (list: CalEvent[]) =>
    ORDER.map((k) => ({ kind: k, items: list.filter((e) => e.kind === k) })).filter((g) => g.items.length > 0);

  /** 오늘(일정이 있으면) → 오늘 이후 첫 날 → 오늘(이 달이면) → 이 달 마지막 일정일.
   *  0913: 계약 시작이 전부 1일에 몰려 있어 13일에 열면 '지남'만 보였다. 지난 날을 기본으로 띄우지 않는다. */
  const firstDayWith = useMemo(() => {
    const keys = [...byDay.keys()].sort();
    const future = keys.find((d) => d >= today);
    if (future) return future;
    if (today.slice(0, 7) === ym) return today;          // 이 달이면 오늘을 띄운다 (비어 있으면 비었다고 말한다)
    return keys[keys.length - 1] ?? null;
  }, [byDay, today, ym]);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => setSel(null), [ym]);
  const shown = sel ?? firstDayWith;
  const shownList = shown ? byDay.get(shown) ?? [] : [];

  /** 한 종류가 이만큼 넘으면 접는다. 9/1 처럼 계약 시작이 27건 몰리는 날을 위한 것. */
  const FOLD = 6;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  /** 미팅 항목에서 '자료'를 누르면 그 줄 아래에 계약서·혜택 등록서 내려받기가 열린다 (민열님 0914). */
  const [docsFor, setDocsFor] = useState<string | null>(null);
  useEffect(() => setExpanded({}), [ym]);

  const shift = (k: number) => { const d = new Date(y, m - 1 + k, 1); onMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };
  const goToday = () => { const t = todayLocal(); onMonth(t.slice(0, 7)); setSel(t); };
  const total = events.length;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_17rem] gap-4">
      <div>
        {/* 필터 — 종류는 칩으로 켜고 끄고, 식당은 이름으로 (같은 이름의 미팅·입금을 한 번에 본다) */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          {ORDER.map((k) => {
            const on = kinds.includes(k);
            const n = allEvents.filter((e) => e.kind === k).length;
            return (
              <button key={k} type="button" onClick={() => toggle(k)} aria-pressed={on}
                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-semibold border transition-colors ${focusRing} ${on ? "bg-white border-black/[0.1] text-gray-800" : "bg-transparent border-black/[0.06] text-gray-400"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${on ? KIND[k].dot : "bg-gray-300"}`} />{KIND[k].label}<span className="tabular-nums text-gray-400">{n}</span>
              </button>
            );
          })}
          <div className="relative ml-auto w-44">
            <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} list="cal-names" placeholder="식당 이름" aria-label="식당으로 거르기" className="pl-7 h-8 text-[12px]" />
            <datalist id="cal-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2.5">
          <button type="button" onClick={() => shift(-1)} aria-label="이전 달" className={`w-8 h-8 rounded-lg hover:bg-black/[0.04] flex items-center justify-center text-gray-600 ${focusRing}`}><IconChevronLeft size={16} aria-hidden="true" /></button>
          <span className="text-[14px] font-bold text-gray-900 tracking-[-0.01em] tabular-nums">{y}년 {m}월</span>
          <button type="button" onClick={() => shift(1)} aria-label="다음 달" className={`w-8 h-8 rounded-lg hover:bg-black/[0.04] flex items-center justify-center text-gray-600 ${focusRing}`}><IconChevronRight size={16} aria-hidden="true" /></button>
          <span className="text-[12px] text-gray-400">{total ? `${total}건` : "일정 없음"}</span>
          <button type="button" onClick={goToday} className={`ml-auto text-[12px] font-semibold text-navy hover:underline rounded ${focusRing}`}>오늘</button>
        </div>

        <div className="grid grid-cols-7 text-center text-[11px] text-gray-400 mb-1">
          {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => <span key={d} className={i === 0 ? "text-red-400" : ""}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: lead }).map((_, i) => <span key={`e${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const d = `${ym}-${String(i + 1).padStart(2, "0")}`;
            const list = byDay.get(d) ?? [];
            const gs = groupsOf(list);
            const on = shown === d;
            const isToday = d === today;
            return (
              <button key={d} type="button" onClick={() => setSel(on ? null : d)} aria-pressed={on}
                aria-label={`${m}월 ${i + 1}일${list.length ? ` · ${gs.map((g) => `${KIND[g.kind].label} ${g.items.length}`).join(", ")}` : " · 일정 없음"}`}
                className={`min-h-[74px] rounded-xl border text-left px-1.5 pt-1.5 pb-1 transition-colors ${focusRing} ${on ? "border-navy/60 bg-navy/[0.05] ring-1 ring-navy/20" : list.length ? "border-black/[0.06] bg-white hover:bg-navy/[0.03]" : "border-black/[0.04] bg-white/60"}`}>
                <span className={`inline-flex items-center justify-center text-[11px] tabular-nums leading-none ${isToday ? "w-[18px] h-[18px] rounded-full bg-navy text-white font-bold" : list.length ? "text-gray-800 font-semibold" : "text-gray-400"}`}>{i + 1}</span>
                <span className="block mt-1 space-y-[3px]">
                  {gs.slice(0, 2).map((g) => (
                    <span key={g.kind} className={`block text-[10px] leading-[14px] px-1 rounded truncate ${KIND[g.kind].chip}`}>
                      {g.items.length === 1 ? g.items[0].label : `${KIND[g.kind].label} ${g.items.length}`}
                    </span>
                  ))}
                  {gs.length > 2 && <span className="block text-[10px] leading-[14px] px-1 text-gray-400">+{gs.length - 2}종</span>}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 mt-2.5 text-[11px] text-gray-500">
          {ORDER.map((k) => <span key={k} className="inline-flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${KIND[k].dot}`} />{KIND[k].label}</span>)}
        </div>
      </div>

      <div className="xl:border-l xl:border-black/[0.06] xl:pl-4">
        <p className="text-[12px] font-semibold text-gray-700 mb-2">
          {shown ? `${Number(shown.slice(5, 7))}월 ${Number(shown.slice(8))}일` : "일정"}
          {shown === today && <span className="ml-1.5 text-[11px] font-medium text-navy">오늘</span>}
          {shown && shown !== today && <span className="ml-1.5 text-[11px] font-medium text-gray-400">{shown > today ? "· 예정" : "· 지남"}</span>}
        </p>
        {shownList.length === 0 ? (
          <div className="text-[13px] text-gray-500">
            {total === 0 ? (
              "이 달에 잡힌 일정이 없습니다. 후보의 미팅 일시·기한, 매장의 계약 시작일을 적으면 여기에 뜹니다."
            ) : (
              <>
                이 날은 비어 있습니다.
                {(() => {
                  const keys = [...byDay.keys()].sort();
                  const next = keys.find((d) => d > (shown ?? today));
                  const prev = [...keys].reverse().find((d) => d < (shown ?? today));
                  const jump = next ?? prev;
                  return jump ? (
                    <button type="button" onClick={() => setSel(jump)} className={`ml-1 font-semibold text-navy hover:underline rounded ${focusRing}`}>
                      {next ? "다음" : "지난"} 일정 {Number(jump.slice(5, 7))}/{Number(jump.slice(8))} 보기
                    </button>
                  ) : null;
                })()}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3 max-h-[22rem] overflow-y-auto pr-1">
            {groupsOf(shownList).map((g) => (
              <div key={g.kind}>
                <p className="flex items-baseline gap-1.5 mb-1"><span className={`w-1.5 h-1.5 rounded-full ${KIND[g.kind].dot}`} /><span className="text-[11px] font-semibold text-gray-600">{KIND[g.kind].label}</span><span className="text-[11px] text-gray-400 tabular-nums">{g.items.length}</span></p>
                <ul className={`border-l-2 ${KIND[g.kind].bar} pl-2 space-y-0.5`}>
                  {(expanded[`${shown}:${g.kind}`] ? g.items : g.items.slice(0, FOLD)).map((e, i) => (
                    <li key={i} className="flex items-center gap-1">
                      <button type="button" onClick={e.onClick} className={`flex-1 min-w-0 text-left py-1 px-1 rounded hover:bg-black/[0.03] ${focusRing}`}>
                        <span className="block text-[13px] font-medium text-gray-900 truncate">{e.label}</span>
                        {e.sub && <span className="block text-[11px] text-gray-500 truncate">{e.sub}</span>}
                      </button>
                      {e.kind === "meeting" && (
                        <button type="button" aria-label={`${e.label} 미팅 자료`} title="계약서 · 혜택 등록서"
                          aria-pressed={docsFor === `${shown}:${g.kind}:${i}`}
                          onClick={() => setDocsFor(docsFor === `${shown}:${g.kind}:${i}` ? null : `${shown}:${g.kind}:${i}`)}
                          className={`shrink-0 w-7 h-7 rounded-lg text-gray-400 hover:text-navy hover:bg-navy/[0.06] flex items-center justify-center ${focusRing}`}>
                          <IconFileDownload size={15} aria-hidden="true" />
                        </button>
                      )}
                      {e.msg && (e.kind === "payment" || e.kind === "meeting" || e.kind === "contract") && (
                        <button type="button" aria-label={`${e.label} 문자 보내기`} title="문자 보내기"
                          onClick={() => setMsg({ ctx: { ...e.msg!, sender: actor }, ev: { kind: e.kind, past: e.date < today, tomorrow: isTomorrow(e.date, today) } })}
                          className={`shrink-0 w-7 h-7 rounded-lg text-gray-400 hover:text-navy hover:bg-navy/[0.06] flex items-center justify-center ${focusRing}`}>
                          <IconMessage2 size={15} aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {/* 열어 둔 미팅 자료 */}
                {g.kind === "meeting" && docsFor?.startsWith(`${shown}:meeting:`) && (
                  <div className="mt-1.5 ml-2 rounded-lg bg-black/[0.03] p-2">
                    <DocQuickLinks ids={DOC_SETS.meeting} label="미팅에 들고 갈 것" />
                  </div>
                )}
                {g.items.length > FOLD && (
                  <button type="button" onClick={() => setExpanded((x) => ({ ...x, [`${shown}:${g.kind}`]: !x[`${shown}:${g.kind}`] }))}
                    className={`mt-1 ml-2 text-[11px] font-semibold text-navy hover:underline rounded ${focusRing}`}>
                    {expanded[`${shown}:${g.kind}`] ? "접기" : `${g.items.length - FOLD}곳 더 보기`}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {msg && (
        <MessageComposer open ctx={msg.ctx} event={{ kind: msg.ev.kind === "due" ? "due" : msg.ev.kind, past: msg.ev.past, tomorrow: msg.ev.tomorrow, overdue: msg.ev.kind === "payment" && msg.ev.past }}
          onClose={() => setMsg(null)} onSent={onLogged} />
      )}
    </div>
  );
}

function isTomorrow(date: string, today: string): boolean {
  const t = new Date(`${today}T00:00:00`);
  t.setDate(t.getDate() + 1);
  return date === `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
