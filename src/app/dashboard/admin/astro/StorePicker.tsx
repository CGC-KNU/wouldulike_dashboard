"use client";

import { useMemo, useState } from "react";
import type { StoreRow } from "@/lib/draft/types";
import { PLAN_NAME, planFromTier } from "@/lib/quote/quote";
import { Input } from "../_shared/ui";

/** 매장 고르기 — 이름 일부로 검색, 위아래 키 · Enter 로 고른다 (1008 민열님 "드롭다운 말고 검색도"). */
export default function StorePicker({ list, value, loading, onPick, listId = "astro-store-list" }: { list: StoreRow[]; value: StoreRow | null; loading: boolean; onPick: (id: number | null) => void; listId?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const norm = (x: string) => x.replace(/\s+/g, "").toLowerCase();
  const hits = useMemo(() => {
    const k = norm(q);
    return (k ? list.filter((s) => norm(`${s.name}${s.ops?.map_name ?? ""}`).includes(k) || String(s.restaurant_id) === k) : list).slice(0, 30);
  }, [list, q]);
  const label = (s: StoreRow) => `${s.name} · ${PLAN_NAME[planFromTier(s.tier)]}${s.ops?.campus ? ` · ${s.ops.campus}` : ""}`;
  const choose = (s: StoreRow) => { onPick(s.restaurant_id); setQ(""); setOpen(false); };
  return (
    <div className="relative">
      <Input
        value={open ? q : value ? label(value) : q}
        placeholder={loading ? "불러오는 중…" : "매장 이름으로 검색"}
        disabled={loading}
        role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        onFocus={() => { setOpen(true); setHi(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(hits.length - 1, h + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          else if (e.key === "Enter" && hits[hi]) { e.preventDefault(); choose(hits[hi]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && !loading && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-black/10 bg-white py-1 shadow-lg dark:bg-[#12123A]">
          {hits.length === 0 && <li className="px-3 py-2 text-[12.5px] text-gray-500">맞는 매장이 없습니다</li>}
          {hits.map((s, i) => (
            <li key={s.restaurant_id} role="option" aria-selected={i === hi}
              onMouseDown={(e) => { e.preventDefault(); choose(s); }} onMouseEnter={() => setHi(i)}
              className={`cursor-pointer px-3 py-1.5 text-[13px] ${i === hi ? "bg-navy/[0.07] text-navy" : "text-gray-800 dark:text-gray-200"}`}>{label(s)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
