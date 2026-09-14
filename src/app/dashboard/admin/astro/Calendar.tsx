"use client";

import { useEffect, useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconFileDownload, IconMessage2, IconPlus, IconSearch } from "@tabler/icons-react";
import type { Lead, StoreRow, TaxInvoice } from "@/lib/draft/types";
import { isPaidTier } from "@/lib/draft/types";
import type { MsgContext } from "@/lib/draft/message";
import { Input, focusRing, todayLocal } from "../_shared/ui";
import MessageComposer from "./MessageComposer";
import DocQuickLinks, { DOC_SETS } from "./DocQuickLinks";
import QuickAdd from "./QuickAdd";
import { looseToISO } from "@/lib/draft/dates";

/**
 * 영업 일정 — 날짜가 있는 것은 전부 한 달 위에 놓는다 (민열님 0911 · 0914).
 *
 * 실제 데이터는 한 날짜에 몰린다 — 대부분 9월 1일 계약 시작 + 월납. 그래서 점을 40개 찍는 대신
 * **종류별로 묶어 글자로** 보여준다("입금 예정 12곳"). 하루에 한 건이면 매장 이름을 그대로 쓴다.
 *
 * 입금 예정일은 계약 시작일의 '일'을 매달 반복한다(대부분 1일). 청구 시작 월 전에는 찍지 않는다.
 * 시트 날짜는 "8/6(목) 14시" 같은 자유 서식이라 느슨하게 읽고, 못 읽으면 조용히 빠진다(지어내지 않는다).
 */

/**
 * 달력에 찍히는 날짜의 전부 (민열님 0914: "뭐든 날짜가 있는 건 다 표기되게").
 * 후보 · 매장 운영 · 세금계산서 세 곳에 흩어져 있던 날짜 칸을 여기 한 줄로 모았다.
 * 감사 로그성 시각(마지막 손댐 · 시트 동기화 · 수정 시각)은 뺀다 — 그건 일정이 아니라 흔적이다.
 */
export type CalKind =
  | "contacted" | "meeting" | "due"
  | "quote" | "returned" | "signed" | "contract" | "contract_end"
  | "payment" | "paid" | "issued" | "requested" | "approved";

export type CalEvent = {
  date: string; kind: CalKind; label: string; sub?: string; onClick?: () => void;
  /** 문자 보내기에 필요한 값. 입금·미팅·계약 시작 항목에만 붙는다. */
  msg?: MsgContext;
};

const KIND: Record<CalKind, { label: string; dot: string; chip: string; bar: string; from: string }> = {
  contacted:    { label: "컨택",        dot: "bg-slate-400",     chip: "bg-slate-100 text-slate-700",   bar: "border-l-slate-400",   from: "후보" },
  meeting:      { label: "미팅",        dot: "bg-navy",          chip: "bg-navy/[0.07] text-navy",      bar: "border-l-navy",        from: "후보" },
  due:          { label: "기한",        dot: "bg-amber-500",     chip: "bg-amber-50 text-amber-800",    bar: "border-l-amber-500",   from: "후보" },
  quote:        { label: "견적서 발송",  dot: "bg-sky-500",       chip: "bg-sky-50 text-sky-800",        bar: "border-l-sky-500",     from: "매장" },
  returned:     { label: "계약서 회수",  dot: "bg-violet-500",    chip: "bg-violet-50 text-violet-800",  bar: "border-l-violet-500",  from: "매장" },
  signed:       { label: "계약 체결",    dot: "bg-teal-500",      chip: "bg-teal-50 text-teal-800",      bar: "border-l-teal-500",    from: "매장" },
  contract:     { label: "계약 시작",    dot: "bg-emerald-500",   chip: "bg-emerald-50 text-emerald-800", bar: "border-l-emerald-500", from: "매장" },
  contract_end: { label: "계약 종료",    dot: "bg-rose-500",      chip: "bg-rose-50 text-rose-800",      bar: "border-l-rose-500",    from: "매장" },
  payment:      { label: "입금 예정",    dot: "bg-periwinkle",    chip: "bg-periwinkle/15 text-navy",    bar: "border-l-periwinkle",  from: "매장" },
  paid:         { label: "입금 완료",    dot: "bg-green-600",     chip: "bg-green-50 text-green-800",    bar: "border-l-green-600",   from: "청구" },
  issued:       { label: "계산서 발행",  dot: "bg-cyan-600",      chip: "bg-cyan-50 text-cyan-800",      bar: "border-l-cyan-600",    from: "청구" },
  requested:    { label: "계산서 품의",  dot: "bg-gray-300",      chip: "bg-gray-100 text-gray-600",     bar: "border-l-gray-300",    from: "청구" },
  approved:     { label: "계산서 승인",  dot: "bg-indigo-400",    chip: "bg-indigo-50 text-indigo-700",  bar: "border-l-indigo-400",  from: "청구" },
};
const ORDER: CalKind[] = [
  "meeting", "due", "contacted",
  "quote", "returned", "signed", "contract", "contract_end",
  "payment", "paid", "issued", "requested", "approved",
];
/** 처음 열었을 때 켜 두는 것. 품의·승인은 하루 안에 지나가는 절차라 꺼 둔다 — 칩 하나로 켠다. */
const DEFAULT_ON: CalKind[] = ORDER.filter((k) => k !== "requested" && k !== "approved");

/** 문자 템플릿은 네 가지뿐이다. 어떤 일정에서 어떤 문안을 기본으로 열지 정한다. 없으면 문자 버튼도 없다. */
const SMS_KIND: Partial<Record<CalKind, "payment" | "meeting" | "contract" | "due">> = {
  meeting: "meeting", due: "due", contract: "contract", payment: "payment", paid: "payment",
};

/** 같은 규칙이 두 곳에서 갈라지지 않게 공용 것을 쓴다. 예전 이름은 그대로 둔다. */
export const parseLoose = looseToISO;

/** ISO 시각("2026-09-14T01:11:17Z")도, 날짜만("2026-09-14")도 앞 10자가 날짜다. */
function ymd(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

export function buildEvents(
  stores: StoreRow[],
  leads: Lead[],
  ym: string,
  onStore: (id: number) => void,
  onLead: (id: string) => void,
  invoices: TaxInvoice[] = [],
  onTax?: () => void,
): CalEvent[] {
  const [y, m] = ym.split("-").map(Number);
  const out: CalEvent[] = [];

  // ── 파트너 후보 — 컨택 · 미팅 · 기한
  for (const l of leads) {
    if (["재컨택", "보류", "거절", "계약 완료"].includes(l.stage)) continue;
    const msg: MsgContext = { name: l.name, targetType: "lead", targetId: l.id, owner: l.owner_name, phone: l.contact ?? l.phone, meetingAt: l.meeting_at, nextAction: l.next_action };
    const go = () => onLead(l.id);
    const mt = parseLoose(l.meeting_at, y); if (mt) out.push({ date: mt, kind: "meeting", label: l.name, sub: l.meeting_at ?? undefined, onClick: go, msg });
    const du = parseLoose(l.due, y); if (du) out.push({ date: du, kind: "due", label: l.name, sub: l.next_action ?? undefined, onClick: go, msg });
    const ct = parseLoose(l.contacted_at, y); if (ct) out.push({ date: ct, kind: "contacted", label: l.name, sub: l.channel ? `${l.channel} · ${l.stage}` : l.stage, onClick: go });
  }

  // ── 파트너 매장 — 견적 · 회수 · 체결 · 시작 · 종료 · 입금 예정
  for (const s of stores) {
    if (!s.is_affiliate || s.ops?.is_test) continue;
    const o = s.ops;
    const start = parseLoose(o?.contract_started_on, y);
    const go = () => onStore(s.restaurant_id);
    const base: MsgContext = { name: s.name, targetType: "store", targetId: String(s.restaurant_id), owner: o?.owner_name, phone: o?.owner_phone, fee: o?.monthly_fee, period: ym };

    const q = ymd(o?.quote_sent_at); if (q) out.push({ date: q, kind: "quote", label: s.name, sub: o?.extra_quote ? `별도 견적: ${o.extra_quote}` : "견적서 발송", onClick: go });
    const r = ymd(o?.contract_returned_at); if (r) out.push({ date: r, kind: "returned", label: s.name, sub: o?.contract_original ? `원본 ${o.contract_original}` : "계약서 회수", onClick: go });
    const sg = parseLoose(o?.contract_signed_on, y); if (sg) out.push({ date: sg, kind: "signed", label: s.name, sub: o?.contract_months ? `${o.contract_months}개월 계약` : "계약 체결", onClick: go });
    if (start) out.push({ date: start, kind: "contract", label: s.name, sub: "파트너 계약 시작", onClick: go, msg: base });
    const end = parseLoose(o?.contract_ends_on, y); if (end) out.push({ date: end, kind: "contract_end", label: s.name, sub: "계약 종료 — 갱신 이야기를 꺼낼 때", onClick: go });

    if (isPaidTier(s.tier) && o?.pay_cycle !== "LUMP" && o?.billing !== "EXEMPT") {
      const billingStart = o?.billing_start_period ?? (start ? start.slice(0, 7) : null);
      if (billingStart && ym < billingStart) continue;
      // 이미 입금이 찍힌 달은 '예정'을 겹쳐 찍지 않는다 — 아래 '입금 완료'가 그 자리를 맡는다.
      const invThis = invoices.find((i) => i.restaurant_id === s.restaurant_id && i.period === ym && !["CANCELED", "REJECTED"].includes(i.status));
      if (invThis?.paid_at) continue;
      const day = start ? Number(start.slice(8, 10)) : 1;
      const last = new Date(y, m, 0).getDate();
      const d = `${ym}-${String(Math.min(day, last)).padStart(2, "0")}`;
      out.push({ date: d, kind: "payment", label: s.name, sub: o?.monthly_fee ? `${o.monthly_fee.toLocaleString()}원` : "월 이용료 미입력", onClick: go, msg: { ...base, dateLabel: `${Number(d.slice(5, 7))}/${Number(d.slice(8))}` } });
    }
  }

  // ── 세금계산서 — 실제로 일어난 날. 어느 달 것인지(period)가 아니라 **그 일이 있었던 날**에 찍는다.
  for (const inv of invoices) {
    if (["CANCELED", "REJECTED"].includes(inv.status)) continue;
    const go = onTax ?? (() => onStore(inv.restaurant_id));
    const won = `${inv.total.toLocaleString()}원`;
    const per = `${Number(inv.period.slice(5))}월분`;
    const msg: MsgContext = { name: inv.name, targetType: "store", targetId: String(inv.restaurant_id), fee: inv.total, period: inv.period };
    const pd = ymd(inv.paid_at); if (pd) out.push({ date: pd, kind: "paid", label: inv.name, sub: `${won} · ${per} 입금`, onClick: go, msg });
    const isd = ymd(inv.issued_at); if (isd) out.push({ date: isd, kind: "issued", label: inv.name, sub: inv.nts_no ? `승인번호 ${inv.nts_no}` : `${won} · ${per}`, onClick: go });
    const rq = ymd(inv.requested_at); if (rq) out.push({ date: rq, kind: "requested", label: inv.name, sub: `${won} · ${per} 품의`, onClick: go });
    const ap = ymd(inv.approved_at); if (ap) out.push({ date: ap, kind: "approved", label: inv.name, sub: inv.approved_by ? `승인 ${inv.approved_by}` : `${won} · ${per}`, onClick: go });
  }

  return out.filter((e) => e.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

export default function Calendar({ events: allEvents, ym, onMonth, actor, onLogged, leads = [], stores = [] }: { events: CalEvent[]; ym: string; onMonth: (ym: string) => void; actor?: string; onLogged?: () => void; leads?: Lead[]; stores?: StoreRow[] }) {
  const [y, m] = ym.split("-").map(Number);
  // 필터 — 종류(미팅/기한/계약 시작/입금 예정)와 식당 이름 (민열님 0911)
  const [kinds, setKinds] = useState<CalKind[]>([...DEFAULT_ON]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ctx: MsgContext; ev: { kind: CalKind; past: boolean; tomorrow: boolean } } | null>(null);
  const events = useMemo(() => {
    const s = q.trim();
    return allEvents.filter((e) => kinds.includes(e.kind) && (!s || e.label.includes(s)));
  }, [allEvents, kinds, q]);
  const names = useMemo(() => [...new Set(allEvents.map((e) => e.label))].sort((a, b) => a.localeCompare(b, "ko")), [allEvents]);
  const toggle = (k: CalKind) => setKinds((cur) => (cur.includes(k) ? (cur.length === 1 ? cur : cur.filter((x) => x !== k)) : [...cur, k]));
  const allOn = ORDER.every((k) => kinds.includes(k));
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
  /** 날짜 칸의 '+' — 그 날짜로 미팅·기한·계약 시작을 바로 등록한다 (민열님 0914). */
  const [addFor, setAddFor] = useState<string | null>(null);
  useEffect(() => setExpanded({}), [ym]);

  const shift = (k: number) => { const d = new Date(y, m - 1 + k, 1); onMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };
  const goToday = () => { const t = todayLocal(); onMonth(t.slice(0, 7)); setSel(t); };
  const total = events.length;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_17rem] gap-4">
      <div>
        {/* 필터 — 종류는 칩으로 켜고 끄고, 식당은 이름으로 (같은 이름의 미팅·입금을 한 번에 본다) */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          {/* 이 달에 실제로 있는 종류만 칩으로 낸다 — 늘 0인 칩 13개는 필터가 아니라 잡음이다. */}
          {ORDER.filter((k) => allEvents.some((e) => e.kind === k)).map((k) => {
            const on = kinds.includes(k);
            const n = allEvents.filter((e) => e.kind === k).length;
            return (
              <button key={k} type="button" onClick={() => toggle(k)} aria-pressed={on} title={`${KIND[k].from}에서 옵니다`}
                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-semibold border transition-colors ${focusRing} ${on ? "bg-white border-black/[0.1] text-gray-800" : "bg-transparent border-black/[0.06] text-gray-400"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${on ? KIND[k].dot : "bg-gray-300"}`} />{KIND[k].label}<span className="tabular-nums text-gray-400">{n}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => setKinds(allOn ? [...DEFAULT_ON] : [...ORDER])}
            className={`h-7 px-2.5 rounded-full text-[12px] font-semibold text-navy hover:bg-navy/[0.06] ${focusRing}`}>
            {allOn ? "기본만" : "전부 보기"}
          </button>
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
              /* 칸 전체가 누르는 자리이고, 오른쪽 위 '+' 는 그 위에 얹는다.
                 버튼 안에 버튼을 넣을 수 없어 형제로 두고 칸 버튼을 절대 위치로 깔았다. */
              <div key={d} className="relative group min-h-[74px]">
                <button type="button" onClick={() => setSel(on ? null : d)} aria-pressed={on}
                  aria-label={`${m}월 ${i + 1}일${list.length ? ` · ${gs.map((g) => `${KIND[g.kind].label} ${g.items.length}`).join(", ")}` : " · 일정 없음"}`}
                  className={`absolute inset-0 w-full h-full rounded-xl border text-left px-1.5 pt-1.5 pb-1 transition-colors ${focusRing} ${on ? "border-navy/60 bg-navy/[0.05] ring-1 ring-navy/20" : list.length ? "border-black/[0.06] bg-white hover:bg-navy/[0.03]" : "border-black/[0.04] bg-white/60"}`}>
                  <span className={`inline-flex items-center justify-center text-[11px] tabular-nums leading-none ${isToday ? "w-[18px] h-[18px] rounded-full bg-navy text-white font-bold" : list.length ? "text-gray-800 font-semibold" : "text-gray-400"}`}>{i + 1}</span>
                  <span className="block mt-1 space-y-[3px] pr-4">
                    {gs.slice(0, 2).map((g) => (
                      <span key={g.kind} className={`block text-[10px] leading-[14px] px-1 rounded truncate ${KIND[g.kind].chip}`}>
                        {g.items.length === 1 ? g.items[0].label : `${KIND[g.kind].label} ${g.items.length}`}
                      </span>
                    ))}
                    {gs.length > 2 && <span className="block text-[10px] leading-[14px] px-1 text-gray-400">+{gs.length - 2}종</span>}
                  </span>
                </button>
                {/* 늘 보이되 조용히. 칸에 손이 가면 또렷해진다 — 있는 줄 모르면 없는 것과 같다. */}
                <button type="button" onClick={() => setAddFor(d)}
                  aria-label={`${m}월 ${i + 1}일에 일정 등록`} title="미팅 · 기한 · 계약 시작 등록"
                  className={`absolute top-1 right-1 w-5 h-5 rounded-md flex items-center justify-center text-gray-400 bg-white/80 border border-black/[0.06] opacity-45 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-navy hover:border-navy/30 hover:bg-navy/[0.06] transition-opacity ${focusRing}`}>
                  <IconPlus size={12} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 mt-2.5 text-[11px] text-gray-500">
          {ORDER.filter((k) => kinds.includes(k) && allEvents.some((e) => e.kind === k)).map((k) => (
            <span key={k} className="inline-flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${KIND[k].dot}`} />{KIND[k].label}</span>
          ))}
        </div>
      </div>

      <div className="xl:border-l xl:border-black/[0.06] xl:pl-4">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-[12px] font-semibold text-gray-700">
            {shown ? `${Number(shown.slice(5, 7))}월 ${Number(shown.slice(8))}일` : "일정"}
            {shown === today && <span className="ml-1.5 text-[11px] font-medium text-navy">오늘</span>}
            {shown && shown !== today && <span className="ml-1.5 text-[11px] font-medium text-gray-400">{shown > today ? "· 예정" : "· 지남"}</span>}
          </p>
          <button type="button" onClick={() => setAddFor(shown ?? today)}
            className={`ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[12px] font-semibold text-navy border border-navy/20 bg-navy/[0.04] hover:bg-navy/[0.09] ${focusRing}`}>
            <IconPlus size={13} aria-hidden="true" />이 날에 등록
          </button>
        </div>
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
                      {e.msg && SMS_KIND[e.kind] && (
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
        <MessageComposer open ctx={msg.ctx} event={{ kind: SMS_KIND[msg.ev.kind] ?? "payment", past: msg.ev.past, tomorrow: msg.ev.tomorrow, overdue: msg.ev.kind === "payment" && msg.ev.past }}
          onClose={() => setMsg(null)} onSent={onLogged} />
      )}

      {addFor && (
        <QuickAdd date={addFor} leads={leads} stores={stores} actor={actor}
          onClose={() => setAddFor(null)}
          onSaved={() => { setSel(addFor); onLogged?.(); }} />
      )}
    </div>
  );
}

function isTomorrow(date: string, today: string): boolean {
  const t = new Date(`${today}T00:00:00`);
  t.setDate(t.getDate() + 1);
  return date === `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
