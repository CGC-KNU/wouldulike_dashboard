"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconChevronDown, IconSearch, IconX } from "@tabler/icons-react";
import { FOUNDERS, GROUPS } from "@/lib/atlas";

/**
 * Orbit 담당 고르기 (1011 민열님: 쉼표로 치지 말고 검색 · 드롭다운으로 팀원 체크).
 * 명단은 Atlas 조직도(lib/atlas.ts) 하나 — 사람이 바뀌면 거기만 고친다.
 * 저장은 지금처럼 이름(성 뺀 두 글자, 예: 「준영」)으로 둔다 — 이미 들어 있는 값 · ASTRO 담당 칸과 같은 모양.
 */
type Member = { full: string; short: string; title: string; role: string; team: string };

const MEMBERS: Member[] = (() => {
  const seen = new Set<string>();
  const out: Member[] = [];
  const add = (p: { name: string; title: string; role: string }, team: string) => {
    if (seen.has(p.name)) return;
    seen.add(p.name);
    out.push({ full: p.name, short: p.name.slice(1), title: p.title, role: p.role, team });
  };
  FOUNDERS.forEach((p) => add(p, "대표"));
  GROUPS.forEach((g) => g.people.forEach((p) => add(p, g.kr)));
  return out;
})();

const find = (v: string) => MEMBERS.find((m) => m.short === v || m.full === v);

export default function OwnerPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const list = useMemo(() => {
    const k = q.replace(/\s+/g, "").toLowerCase();
    return MEMBERS.filter((m) => !k || (m.full + m.title + m.role + m.team).toLowerCase().replace(/\s+/g, "").includes(k));
  }, [q]);
  useEffect(() => { setCur(0); }, [q]);
  const on = (m: Member) => value.some((v) => v === m.short || v === m.full);
  const toggle = (m: Member) => onChange(on(m) ? value.filter((v) => v !== m.short && v !== m.full) : [...value, m.short]);

  return (
    <div ref={box} className="relative">
      <div role="combobox" aria-expanded={open} aria-haspopup="listbox" onClick={() => { setOpen(true); input.current?.focus(); }}
        className="w-full min-h-[36px] rounded-lg border border-black/10 px-2 py-1 flex flex-wrap items-center gap-1 cursor-text focus-within:border-navy/40">
        {value.map((v) => {
          const m = find(v);
          return (
            <span key={v} className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-navy/[0.07] text-[12px] font-semibold text-navy">
              {v}{m && <span className="text-[10.5px] font-medium text-navy/60">{m.title}</span>}
              <button type="button" aria-label={`${v} 빼기`} onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x !== v)); }} className="w-4 h-4 grid place-items-center rounded-full hover:bg-navy/10"><IconX size={11} /></button>
            </span>
          );
        })}
        <span className="flex-1 min-w-[6rem] flex items-center gap-1">
          <IconSearch size={13} className="text-gray-400 shrink-0" aria-hidden="true" />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setCur((c) => Math.min(list.length - 1, c + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); if (list[cur]) { toggle(list[cur]); setQ(""); } }
              else if (e.key === "Escape") setOpen(false);
              else if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1));
            }}
            placeholder={value.length ? "" : "이름 · 직함으로 찾기"} aria-label="담당 찾기" className="flex-1 min-w-0 bg-transparent outline-none text-[13px] py-0.5" />
        </span>
        <IconChevronDown size={14} className="text-gray-400 shrink-0" aria-hidden="true" />
      </div>
      {open && (
        <ul role="listbox" aria-multiselectable="true" className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-auto rounded-xl border border-black/10 bg-white shadow-[0_18px_40px_-20px_rgba(6,0,115,0.4)] py-1">
          {list.length === 0 && <li className="px-3 py-2 text-[12.5px] text-gray-400">맞는 팀원이 없습니다</li>}
          {list.map((m, i) => (
            <li key={m.full} role="option" aria-selected={on(m)}>
              <button type="button" onMouseEnter={() => setCur(i)} onClick={() => { toggle(m); setQ(""); input.current?.focus(); }}
                className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-[13px] ${i === cur ? "bg-navy/[0.05]" : ""}`}>
                <span className={`w-4 h-4 rounded border grid place-items-center shrink-0 ${on(m) ? "bg-navy border-navy text-white" : "border-black/20"}`}>{on(m) && <IconCheck size={11} stroke={3} />}</span>
                <span className="font-semibold text-gray-900">{m.full}</span>
                <span className="text-[11.5px] text-gray-500 truncate">{m.title} · {m.role}</span>
                <span className="ml-auto text-[11px] text-gray-400 shrink-0">{m.team}</span>
              </button>
            </li>))}
        </ul>
      )}
    </div>
  );
}
