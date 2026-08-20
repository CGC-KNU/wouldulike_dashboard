"use client";

import { useCallback, useEffect, useState } from "react";

import { LockQueueItem, fmtMD } from "./types";

/**
 * 잠금 건 승인 큐 (설계서 §16-5, §16-6) — 리드 전용.
 *
 * D-1 23:59 마감을 못 지켜 크론이 잠근 콘텐츠 목록. 여기서 풀어주면 담당자가
 * 다시 편집할 수 있다 — 단, 지각 판정(locked_at) 자체는 취소되지 않는다(§16-2).
 */
export default function LockApprovalQueue({ onOpenPlan }: { onOpenPlan: (planId: number) => void }) {
  const [items, setItems] = useState<LockQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/satellite/attendance/unlock-queue");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.detail ?? `불러오지 못했습니다 (${res.status})`);
      } else {
        setItems(d.plans ?? []);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function unlock(id: number) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/satellite/plans/${id}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlock_type: "late_upload" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.detail ?? "잠금 해제에 실패했습니다.");
        return;
      }
      setItems((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return null;
  if (err || items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
      <p className="text-xs font-bold text-red-700 mb-2">마감을 넘겨 잠긴 콘텐츠 {items.length}건</p>
      <div className="flex flex-col gap-1.5">
        {items.map((p) => (
          <div key={p.id} className="flex items-center gap-2 bg-white/60 rounded-lg px-2.5 py-1.5">
            <button
              onClick={() => onOpenPlan(p.id)}
              className="flex-1 min-w-0 text-left flex items-center gap-2"
            >
              <span className="text-[10px] font-semibold text-red-600 shrink-0">{fmtMD(p.scheduled_date)}</span>
              <span className="text-[11px] text-red-700 font-medium truncate">{p.topic || "(주제 미정)"}</span>
              <span className="text-[10px] text-red-500 shrink-0">· {p.owner_name}</span>
            </button>
            <button
              onClick={() => unlock(p.id)}
              disabled={busyId === p.id}
              className="shrink-0 text-[10px] font-semibold text-white bg-red-500 rounded-lg px-2.5 py-1 hover:bg-red-600 disabled:opacity-40"
            >
              {busyId === p.id ? "처리 중..." : "잠금 해제"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
