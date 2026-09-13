"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconSearch } from "@tabler/icons-react";

/**
 * ⌘K 메뉴 검색 (애딧 콘솔 사이드바의 "메뉴 검색 ⌘K" 차용).
 * 화면 이름 + 파트너 매장 + 후보 이름을 한 칸에서 찾는다. 고르면 그 화면(항목이면 상세까지)으로 간다.
 * 하루 수십 번 쓰는 입력이라 여닫는 애니메이션은 없다.
 */
export interface PaletteItem { key: string; label: string; group: string; hint?: string; target: string }

export default function CommandPalette({ tabs, go }: { tabs: { key: string; label: string; product: string }[]; go: (target: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [entities, setEntities] = useState<PaletteItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    setQ(""); setIdx(0);
    setTimeout(() => inputRef.current?.focus(), 0);
    if (entities.length) return;
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([j("/api/astro/stores"), j("/api/astro/leads")]).then(([s, l]) => {
      const items: PaletteItem[] = [];
      for (const st of (s?.stores ?? []) as { restaurant_id: number; name: string; tier: string | null; is_affiliate: boolean }[]) if (st.is_affiliate) items.push({ key: `s${st.restaurant_id}`, label: st.name, group: "파트너 매장", hint: st.tier ?? "플랜 미지정", target: `astro-ops?open=${st.restaurant_id}` });
      for (const ld of (l?.leads ?? []) as { id: string; name: string; stage: string }[]) items.push({ key: `l${ld.id}`, label: ld.name, group: "파트너 후보", hint: ld.stage, target: `astro-leads?open=${ld.id}` });
      setEntities(items);
    });
  }, [open, entities.length]);

  const all = useMemo<PaletteItem[]>(() => [...tabs.map((t) => ({ key: `t${t.key}`, label: t.label, group: t.product, hint: "화면", target: t.key })), ...entities], [tabs, entities]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all.filter((i) => i.hint === "화면").slice(0, 12);
    return all.filter((i) => `${i.label} ${i.group} ${i.hint ?? ""}`.toLowerCase().includes(s)).slice(0, 14);
  }, [all, q]);
  useEffect(() => setIdx(0), [q]);

  if (!open) return null;
  const pick = (it: PaletteItem) => { setOpen(false); go(it.target); };
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label="메뉴 검색">
      <div className="absolute inset-0 bg-black/20" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-[560px] bg-white rounded-2xl shadow-[0_24px_64px_-24px_rgba(5,0,114,0.5)] border border-black/[0.06] overflow-hidden">
        <div className="flex items-center gap-2 px-4 h-12 border-b border-black/[0.06]">
          <IconSearch size={16} className="text-gray-400" aria-hidden="true" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="화면, 파트너 매장, 후보 이름…" className="flex-1 h-full bg-transparent outline-none text-[14px] text-gray-900 placeholder:text-gray-400"
            onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); } if (e.key === "Enter" && results[idx]) pick(results[idx]); }} />
          <kbd className="text-[10px] text-gray-400 border border-black/[0.08] rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1" role="listbox">
          {results.length === 0 && <li className="px-4 py-6 text-[13px] text-gray-500 text-center">찾는 것이 없습니다</li>}
          {results.map((it, i) => (
            <li key={it.key} role="option" aria-selected={i === idx}>
              <button type="button" onMouseEnter={() => setIdx(i)} onClick={() => pick(it)} className={`w-full flex items-center gap-3 px-4 py-2 text-left ${i === idx ? "bg-navy/[0.06]" : ""}`}>
                <span className="text-[11px] font-semibold text-gray-400 w-16 shrink-0 truncate">{it.group}</span>
                <span className="flex-1 text-[13px] font-medium text-gray-900 truncate">{it.label}</span>
                {it.hint && <span className="text-[11px] text-gray-400">{it.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="px-4 py-2 border-t border-black/[0.06] text-[11px] text-gray-400">↑↓ 이동 · Enter 열기 · ⌘K 닫기</div>
      </div>
    </div>
  );
}
