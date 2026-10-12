"use client";

import { useEffect, useMemo, useState } from "react";
import type { Store } from "@/lib/hubble";
import { CAMPUS_SCHOOL, campusStores, matchName } from "@/lib/hubbleLookup";
import type { Lead } from "@/lib/draft/types";
import { Button, Notice, SlideOver } from "../_shared/ui";

/**
 * 후보 이름을 허블 매장명으로 맞추기 (1012 민열님: 「허블에 있는 매장명이 공식 매장명이니까」).
 * 후보의 캠퍼스 상권(허블 본교 1km)에서 이름으로 찾는다. 한 곳만 맞으면 바꿀 줄로 올리고(기본 체크),
 * 여러 곳이면 사람이 고르게, 못 찾으면 그대로 둔다. 바꾸면 메모에 옛 이름을 남긴다 — 「?매장 옛이름」으로 찾던 사람이 헤매지 않게.
 * 파트너 매장(앱에 보이는 이름)은 건드리지 않는다. 후보 이름만.
 */
type Row = { lead: Lead; hits: Store[]; pick: string; on: boolean };

export default function LeadNameSync({ open, onClose, leads, onDone }: { open: boolean; onClose: () => void; leads: Lead[]; onDone: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows(null); setResult(null);
    (async () => {
      const out: Row[] = [];
      for (const campus of Object.keys(CAMPUS_SCHOOL)) {
        const stores = await campusStores(campus).catch(() => [] as Store[]);
        for (const l of leads.filter((x) => (x.campus ?? "") === campus)) {
          const byId = l.memo?.match(/인허가 (\S+)/)?.[1];
          const hits = byId ? stores.filter((s) => s.id === byId) : matchName(stores, l.name, l.phone);
          const same = hits.some((h) => h.n === l.name);
          if (!hits.length || same) { out.push({ lead: l, hits, pick: same ? l.name : "", on: false }); continue; }
          out.push({ lead: l, hits, pick: hits.length === 1 ? hits[0].n : "", on: hits.length === 1 });
        }
      }
      setRows(out);
    })();
  }, [open, leads]);

  const change = useMemo(() => (rows ?? []).filter((r) => r.hits.length && r.pick && r.pick !== r.lead.name), [rows]);
  const same = (rows ?? []).filter((r) => r.pick && r.pick === r.lead.name).length;
  const none = (rows ?? []).filter((r) => !r.hits.length).length;
  const chosen = change.filter((r) => r.on);
  const set = (id: string, patch: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.lead.id === id ? { ...r, ...patch } : r)));

  async function apply() {
    let ok = 0, fail = 0;
    const day = new Date().toISOString().slice(5, 10);
    for (const [i, r] of chosen.entries()) {
      setBusy(`바꾸는 중… ${i + 1}/${chosen.length}`);
      const memo = `${r.lead.memo ? `${r.lead.memo}\n` : ""}옛 이름: ${r.lead.name} (허블 매장명으로 맞춤 ${day})`;
      const res = await fetch(`/api/astro/leads/${r.lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: r.pick, memo }) }).catch(() => null);
      if (res?.ok) ok++; else fail++;
    }
    setBusy(null);
    setResult(`${ok}곳을 허블 매장명으로 바꿨습니다${fail ? ` · ${fail}곳 실패` : ""}.`);
    onDone();
  }

  return (
    <SlideOver open={open} onClose={onClose} title="허블 매장명으로 맞추기" subtitle="허블 매장명(인허가 상호)이 공식 이름입니다 · 후보 이름만 바꿉니다" width="lg"
      footer={<div className="flex items-center gap-2 w-full"><span className="flex-1 text-[12px] text-gray-500">{busy ?? (rows ? `바꿀 수 있는 곳 ${change.length} · 이미 같음 ${same} · 허블에 없음 ${none}` : "")}</span>
        <Button variant="primary" disabled={!chosen.length || !!busy} onClick={apply}>{chosen.length}곳 바꾸기</Button></div>}>
      <div className="space-y-3 text-[13px]">
        {result && <Notice tone="blue" title={result}>바뀐 이름은 각 후보 메모에 「옛 이름」으로 남았습니다.</Notice>}
        {!rows ? <p className="text-gray-500">허블 매장과 대조하는 중…</p> : change.length === 0 ? <p className="text-gray-500">바꿀 이름이 없습니다 — 모두 허블 매장명과 같거나 허블에서 찾지 못한 곳입니다.</p> : (
          <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.08]">
            {change.map((r) => (
              <li key={r.lead.id} className="flex items-start gap-2.5 px-3 py-2">
                <input type="checkbox" checked={r.on} onChange={() => set(r.lead.id, { on: !r.on })} className="mt-1 accent-[#060073]" aria-label={`${r.lead.name} 바꾸기`} />
                <div className="min-w-0 flex-1">
                  <p><span className="text-gray-500 line-through">{r.lead.name}</span> → <b className="text-gray-900">{r.pick || "고르세요"}</b> <span className="text-[11px] text-gray-400">{r.lead.campus} · {r.lead.stage}</span></p>
                  {r.hits.length > 1 ? (
                    <select value={r.pick} onChange={(e) => set(r.lead.id, { pick: e.target.value, on: !!e.target.value })} className="mt-1 w-full rounded-lg border border-black/10 px-2 py-1 bg-white text-[12.5px]">
                      <option value="">허블에서 {r.hits.length}곳 — 맞는 매장을 고르세요</option>
                      {r.hits.map((h) => <option key={h.id} value={h.n}>{h.n} · {h.a}</option>)}
                    </select>
                  ) : <p className="text-[11.5px] text-gray-400 truncate">{r.hits[0].a}</p>}
                </div>
              </li>))}
          </ul>)}
        {rows && none > 0 && (
          <details><summary className="text-[12px] text-gray-500 cursor-pointer">허블에서 못 찾은 후보 {none}곳 — 그대로 둡니다</summary>
            <p className="mt-1 text-[12px] text-gray-500 leading-relaxed">{rows.filter((r) => !r.hits.length).map((r) => `${r.lead.name}(${r.lead.campus ?? "캠퍼스 없음"})`).join(" · ")}</p>
            <p className="mt-1 text-[11.5px] text-gray-400">상호가 크게 다르게 등록됐거나, 허블 범위(정문 1km 영업 중) 밖이거나, 캠퍼스 칸이 비어 있는 경우입니다.</p></details>)}
      </div>
    </SlideOver>
  );
}
