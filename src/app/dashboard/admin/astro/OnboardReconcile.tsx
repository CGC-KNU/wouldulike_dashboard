"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Notice } from "@/app/dashboard/admin/_shared/ui";

/**
 * 온보딩 결과 → 매장 반영 배너.
 *
 * 왜 자동이 아니고 버튼인가: 값을 **덮어쓰지 않는다**는 원칙 때문이다 (lib/onboard/reconcile.ts).
 * 비어 있는 칸만 채우고, 이미 다른 값이 있으면 다르다고만 말한다. 그 판단은 사람이 한다.
 * 그래서 먼저 무엇이 바뀔지 보여 주고(GET), 누르면 그때 쓴다(POST).
 *
 * 반영할 게 없으면 아무것도 그리지 않는다 — 늘 떠 있는 배너는 아무도 안 본다.
 */

interface Item {
  rid: number; name: string; summary: string;
  fill: Record<string, string | number>;
  conflicts: { field: string; label: string; ours: string; theirs: string }[];
}

export default function OnboardReconcile({ onDone }: { onDone?: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    fetch("/api/onboard/reconcile", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { items?: Item[] } | null) => setItems(j?.items ?? []))
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  const apply = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/onboard/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const j = (await r.json().catch(() => ({}))) as { applied?: { name: string }[]; failed?: { name: string; detail: string }[] };
      const ok = j.applied?.length ?? 0, no = j.failed?.length ?? 0;
      setMsg(no ? `${ok}곳 반영 · ${no}곳 실패 — ${j.failed!.map((f) => `${f.name}(${f.detail})`).join(", ")}` : `${ok}곳 반영했습니다.`);
      load(); onDone?.();
    } catch (e) {
      setMsg((e as Error).message);
    } finally { setBusy(false); }
  };

  if (!items || items.length === 0) return msg ? <div className="mb-3"><Notice tone="blue" title="온보딩 반영">{msg}</Notice></div> : null;

  const conflicts = items.reduce((n, i) => n + i.conflicts.length, 0);
  return (
    <div className="mb-3 rounded-xl border border-navy/20 bg-navy/[0.03] p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[13px] font-semibold text-gray-900">온보딩을 마친 매장 {items.length}곳이 아직 반영되지 않았습니다</p>
          <p className="text-[12px] text-gray-600 mt-0.5">
            사장님이 등록하신 값(대표자·사업자번호·개시일·청구 시작 월·플랜)을 매장에 채웁니다.
            <b> 이미 적혀 있는 값은 건드리지 않습니다.</b>
            {conflicts > 0 && <> 값이 다른 칸 {conflicts}개는 그대로 두고 아래에 적어 둡니다.</>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setOpen((v) => !v)}>{open ? "접기" : "무엇이 바뀌나"}</Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={apply}>{busy ? "반영 중…" : "반영하기"}</Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          {items.map((i) => (
            <div key={i.rid} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
              <p className="text-[12.5px] font-semibold text-gray-900">{i.name} <span className="text-gray-400 font-normal">({i.rid})</span></p>
              <p className="text-[12px] text-gray-600 mt-0.5">{i.summary}</p>
              {i.conflicts.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {i.conflicts.map((c) => (
                    <li key={c.field} className="text-[11.5px] text-amber-800">
                      <b>{c.label}</b> — 온보딩 <b>{c.ours}</b> · 지금 <b>{c.theirs}</b> (그대로 둡니다)
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      {msg && <p className="text-[12px] text-gray-700 mt-2">{msg}</p>}
    </div>
  );
}
