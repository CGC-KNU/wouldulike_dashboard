"use client";

import { useEffect, useState } from "react";
import { IconArrowUpRight } from "@tabler/icons-react";
import { STAGES, SIDE, byUrgency, stageIndex, waiting, type Board, type Project } from "@/lib/orbit";
import { focusRing } from "../_shared/ui";

/**
 * 런처 맨 위 Orbit 카드 (1011). 올해 대구 100곳 막대 + 진행 중인 큰 일 전부(민열님 결정 ⑥), 막힌 것 먼저.
 * 높이는 옆 「이번 주」와 같게 묶이고, 넘치면 카드 안에서 스크롤한다 — 아래 도구를 밀어내지 않는다.
 */
const GOAL = 100;

export function Steps({ p }: { p: Project }) {
  const i = stageIndex(p.stage);
  return <span className="inline-flex gap-[2px]" aria-label={`${p.stage}`}>{STAGES.map((_, k) => <i key={k} className={`block w-3 h-1 rounded-sm ${i >= k ? "bg-navy" : "bg-black/10"}`} />)}</span>;
}

export function StageChip({ p }: { p: Project }) {
  const w = waiting(p);
  if (w) return <span className="shrink-0 text-[10.5px] font-bold px-1.5 py-[1px] rounded-full bg-red-50 text-red-700">답 대기 {w}</span>;
  return <span className="shrink-0 text-[10.5px] font-bold px-1.5 py-[1px] rounded-full bg-amber-50 text-amber-800">{p.stage}</span>;
}

export default function OrbitCard({ onOpen }: { onOpen: (id?: string) => void }) {
  const [board, setBoard] = useState<Board | null | undefined>(undefined);
  const [partners, setPartners] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/orbit", { cache: "no-store", signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)).then(setBoard).catch(() => setBoard(null));
    fetch("/api/astro/stores", { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d?.stores) return;
      type S = { is_affiliate: boolean | null; ops: { is_test?: boolean } | null };
      setPartners((d.stores as S[]).filter((s) => s.is_affiliate && !s.ops?.is_test).length);
    }).catch(() => {});
  }, []);
  const active = (board?.projects ?? []).filter((p) => !(SIDE as readonly string[]).includes(p.stage)).sort(byUrgency);
  const wait = active.reduce((a, p) => a + waiting(p), 0);

  return (
    <section aria-label="Orbit" className="orbit h-full min-h-0 flex flex-col rounded-[20px] border border-white/70 bg-white/85 backdrop-blur shadow-[0_1px_2px_rgba(16,24,40,0.04),0_14px_30px_-26px_rgba(5,0,114,0.5)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <img src="/satellite/orbit_app.svg" alt="" width={22} height={22} className="w-[22px] h-[22px] rounded-[6px]" aria-hidden="true" />
        <h2 className="text-[14px] font-bold text-gray-900 tracking-[-0.01em]">Orbit</h2>
        <span className="text-[11.5px] text-gray-400">여러 팀이 걸친 큰 일</span>
        {wait > 0 && <span className="ml-auto text-[10.5px] font-bold px-1.5 py-[1px] rounded-full bg-red-50 text-red-700">답 대기 {wait}</span>}
        <button type="button" onClick={() => onOpen()} className={`${wait > 0 ? "" : "ml-auto"} inline-flex items-center gap-0.5 text-[12px] font-semibold text-navy rounded ${focusRing}`}>열기 <IconArrowUpRight size={13} aria-hidden="true" /></button>
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-[11.5rem_minmax(0,1fr)] gap-3">
        <div className="rounded-xl bg-navy/[0.04] px-3 py-2.5 self-start">
          <p className="text-[11.5px] text-gray-500">올해 대구 파트너</p>
          <p className="text-[22px] font-extrabold text-gray-900 tabular-nums leading-tight">{partners ?? "—"}<span className="text-[12px] font-medium text-gray-400"> / {GOAL}곳</span></p>
          <span className="block h-1.5 rounded-full bg-black/[0.08] overflow-hidden mt-1.5"><i className="block h-full bg-navy rounded-full" style={{ width: `${Math.min(100, ((partners ?? 0) / GOAL) * 100)}%` }} /></span>
          <p className="text-[10.5px] text-gray-400 mt-1.5 tabular-nums">경대 40 · 영대 30 · 계대 30</p>
        </div>
        <div className="min-h-0 overflow-auto -mr-1 pr-1">
          {board === undefined ? <ul className="space-y-2" aria-hidden="true">{[0, 1, 2].map((i) => <li key={i} className="h-9 rounded-lg bg-black/[0.04] animate-pulse" />)}</ul>
            : board === null ? <p className="text-[12.5px] text-gray-500">Orbit 을 읽지 못했습니다. 새로고침하면 다시 읽습니다.</p>
            : active.length === 0 ? <p className="text-[12.5px] text-gray-500">진행 중인 큰 일이 없습니다. 「열기」에서 새로 만들면 여기 모입니다.</p>
            : <ul className="grid grid-cols-1 xl:grid-cols-2 gap-x-4">
              {active.map((p) => (
                <li key={p.id} className="border-b border-black/[0.05]">
                  <button type="button" onClick={() => onOpen(p.id)} className={`w-full text-left py-1.5 rounded ${focusRing}`}>
                    <span className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-[13px] font-bold text-gray-900">{p.name}</span><StageChip p={p} /></span>
                    <span className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-0.5"><Steps p={p} /><span className="truncate">{p.owners.join(" · ") || "담당 없음"}{p.due ? ` · ${p.due}` : ""}</span></span>
                  </button>
                </li>))}
            </ul>}
        </div>
      </div>
    </section>
  );
}
