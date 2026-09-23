"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Notice } from "../_shared/ui";
import CampusMark from "./CampusMark";

/**
 * 한정 쿠폰 승인 — 사장님이 온보딩에서 적은 한정 쿠폰을 우리가 보고 켠다.
 *
 * 왜 승인을 두나: 한정 쿠폰은 학생회 채널로 매달 나가는 자리다. 편성은 우리가 상권 밸런스를 보고
 * 정하고, 그 전에 문구와 조건도 봐야 한다. 애딧 콘솔의 파트너 승인과 같은 맥락 (0923).
 *
 * 문구를 여기서 고칠 수 있게 둔 이유 — 캠페인에 **그대로 나가는 글**이다. 고칠 데가 없으면
 * 사장님께 다시 물어보거나, 어색한 채로 내보내거나 둘 중 하나가 된다.
 */

interface Pending { rid: number; name: string; campus: string | null; tier: string | null; id: number; title: string; subtitle: string; notes: string }

export default function SpecialApprovals({ onDone }: { onDone?: () => void }) {
  const [items, setItems] = useState<Pending[] | null>(null);
  const [edit, setEdit] = useState<Record<number, { title: string; subtitle: string }>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/onboard/approvals", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { items?: Pending[] } | null) => setItems(j?.items ?? []))
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  const act = async (p: Pending, action: "approve" | "reject") => {
    const e = edit[p.id] ?? { title: p.title, subtitle: p.subtitle };
    const note = action === "reject" ? window.prompt(`${p.name} — 보류 사유를 적어 주세요 (사장님께는 이 문구가 안 보입니다)`, "") : null;
    if (action === "reject" && note === null) return;
    setBusy(p.id); setMsg(null);
    try {
      const r = await fetch("/api/onboard/approvals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rid: p.rid, id: p.id, action, note, title: e.title, subtitle: e.subtitle }),
      });
      const j = (await r.json().catch(() => ({}))) as { detail?: string };
      if (!r.ok) throw new Error(j.detail ?? `실패 (${r.status})`);
      setMsg(action === "approve" ? `${p.name} 한정 쿠폰을 승인했습니다. 앱에 바로 나갑니다.` : `${p.name} 한정 쿠폰을 보류했습니다. 사장님께 사유를 알려 주세요.`);
      load(); onDone?.();
    } catch (err) { setMsg((err as Error).message); } finally { setBusy(null); }
  };

  if (!items || items.length === 0) return msg ? <div className="mb-3"><Notice tone="blue" title="한정 쿠폰">{msg}</Notice></div> : null;

  return (
    <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <p className="text-[13px] font-semibold text-amber-900">승인을 기다리는 한정 쿠폰 {items.length}건</p>
      <p className="text-[12px] text-amber-800 mt-0.5 mb-2.5">
        학생회 채널로 나가는 자리입니다. <b>승인해야 앱에 나갑니다.</b> 문구는 여기서 고치실 수 있습니다 — 캠페인에 그대로 나가는 글입니다.
      </p>
      <div className="space-y-2">
        {items.map((p) => {
          const e = edit[p.id] ?? { title: p.title, subtitle: p.subtitle };
          const set = (k: "title" | "subtitle") => (v: string) => setEdit((m) => ({ ...m, [p.id]: { ...e, [k]: v } }));
          return (
            <div key={p.id} className="rounded-lg border border-amber-200 bg-white p-3">
              <p className="text-[12.5px] font-semibold text-gray-900 flex items-center gap-1.5">
                {p.campus && <CampusMark campus={p.campus} size={14} />}{p.name}
                <span className="text-gray-400 font-normal">{p.rid} · {p.tier === "CONTENT" ? "Premium" : p.tier}</span>
              </p>
              <div className="grid sm:grid-cols-2 gap-2 mt-2">
                <label className="block"><span className="block text-[11.5px] text-gray-500 mb-1">무엇을 드릴지</span>
                  <Input value={e.title} onChange={(ev) => set("title")(ev.target.value)} /></label>
                <label className="block"><span className="block text-[11.5px] text-gray-500 mb-1">어떤 조건에</span>
                  <Input value={e.subtitle} onChange={(ev) => set("subtitle")(ev.target.value)} placeholder="조건 없음" /></label>
              </div>
              {p.notes && p.notes !== p.subtitle && <p className="text-[11.5px] text-gray-500 mt-1.5">메모 · {p.notes}</p>}
              <div className="flex gap-2 mt-2.5">
                <Button size="sm" variant="primary" disabled={busy === p.id || !e.title.trim()} onClick={() => act(p, "approve")}>
                  {busy === p.id ? "처리 중…" : "승인"}
                </Button>
                <Button size="sm" disabled={busy === p.id} onClick={() => act(p, "reject")}>보류</Button>
              </div>
            </div>
          );
        })}
      </div>
      {msg && <p className="text-[12px] text-gray-700 mt-2">{msg}</p>}
    </div>
  );
}
