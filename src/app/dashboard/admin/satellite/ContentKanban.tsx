"use client";

import { useCallback, useEffect, useState } from "react";

import PlanEditor from "./PlanEditor";
import { KanbanResponse, MEDIA_META, MediaType, SatelliteMember, ownerColor } from "./types";

/**
 * 콘텐츠 칸반 (통합 업무 관리 기획안 §5) — 업무 목록 / 피드백 대기 / 완료.
 *
 * 협찬은 여기 없다 — Sponsorship 으로 완전히 분리됐다(§2-2, "협찬" 사이드바 메뉴 참고,
 * 2026-08-23부터 메인 화면 맨 위에도 표시됨).
 *
 * 상태 전이(업무목록→피드백대기→완료)는 전부 자동이다(§6①② — 담당자가 에디터에서
 * 작업물 등록을 마치면 자동으로 피드백 대기, 업로드 예정 시간이 되면 자동으로 완료) —
 * 그래서 컬럼 간 드래그로 상태를 옮기는 기능은 없다. 카드를 클릭하면 PlanEditor 가
 * "에디터" 탭으로 열리는 걸 우선 시도한다 — 본인 담당 건이 아니면 PlanEditor 자체의
 * 안전장치가 "콘텐츠 피드백" 탭으로 되돌린다(§7·§8).
 */
export default function ContentKanban({
  members,
  viewerAccountId,
  isLead,
  today,
  onCreate,
}: {
  members: SatelliteMember[];
  viewerAccountId: number | null;
  isLead: boolean;
  today: string;
  onCreate: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [data, setData] = useState<KanbanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [openPlanId, setOpenPlanId] = useState<number | null>(null);

  const [adding, setAdding] = useState(false);
  const [newDate, setNewDate] = useState(today);
  const [newTopic, setNewTopic] = useState("");
  const [newOwner, setNewOwner] = useState<number | "">(viewerAccountId ?? "");
  const [newMedia, setNewMedia] = useState<MediaType>("carousel");
  const [creating, setCreating] = useState(false);
  const activeMembers = members.filter((m) => m.is_active);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/satellite/kanban");
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setData(d);
      } else {
        setErr(d.detail || "불러오지 못했습니다.");
      }
    } catch {
      setErr("네트워크 오류");
    } finally {
      if (!opts?.soft) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (viewerAccountId && newOwner === "") setNewOwner(viewerAccountId);
  }, [viewerAccountId, newOwner]);

  async function submitNew() {
    if (!newDate) return;
    setCreating(true);
    try {
      const ok = await onCreate({
        scheduled_date: newDate,
        topic: newTopic.trim(),
        owner_id: newOwner || undefined,
        media_type: newMedia,
      });
      if (ok) {
        setNewTopic("");
        setAdding(false);
        load({ soft: true });
      }
    } finally {
      setCreating(false);
    }
  }

  const showInitialSpinner = loading && !data;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-gray-800">콘텐츠 칸반</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              업무 목록 → 피드백 대기 → 완료 — 상태는 자동으로 넘어갑니다. 카드를 클릭하면 열람·피드백 화면이 열립니다.
            </p>
          </div>
          <button
            onClick={() => setAdding((v) => !v)}
            className="shrink-0 text-[11px] font-bold text-white bg-periwinkle rounded-lg px-3 py-2 hover:opacity-90 active:scale-95 transition-all"
          >
            {adding ? "취소" : "+ 새 콘텐츠"}
          </button>
        </div>

        {adding && (
          <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/60 flex flex-col md:flex-row gap-2">
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-periwinkle md:w-40"
            />
            <input
              type="text"
              autoFocus
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNew();
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="주제 (나중에 채워도 됩니다)"
              className="flex-1 min-w-0 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-periwinkle placeholder:text-gray-300"
            />
            <select
              value={newOwner}
              onChange={(e) => setNewOwner(Number(e.target.value))}
              disabled={!isLead}
              className="text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-periwinkle disabled:bg-gray-100 disabled:text-gray-400 md:w-32"
            >
              {activeMembers.length === 0 && <option value="">계정 없음</option>}
              {activeMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name || m.username}
                </option>
              ))}
            </select>
            <select
              value={newMedia}
              onChange={(e) => setNewMedia(e.target.value as MediaType)}
              className="text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-periwinkle md:w-28"
            >
              {(Object.keys(MEDIA_META) as MediaType[]).map((k) => (
                <option key={k} value={k}>
                  {MEDIA_META[k].label}
                </option>
              ))}
            </select>
            <button
              onClick={submitNew}
              disabled={creating}
              className="shrink-0 text-[11px] font-semibold text-white bg-periwinkle rounded-lg px-3 py-2 hover:bg-navy transition-colors disabled:opacity-50"
            >
              {creating ? "등록 중..." : "등록"}
            </button>
          </div>
        )}

        {showInitialSpinner && <p className="text-[11px] text-gray-300 text-center py-8">불러오는 중...</p>}
        {!showInitialSpinner && err && !data && (
          <p className="text-[11px] text-red-500 text-center py-8">{err}</p>
        )}

        {data && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-gray-100">
            {data.columns.map((col) => (
              <div key={col.key} className="bg-white flex flex-col min-h-[240px]">
                <div className="px-3 py-2.5 border-b border-gray-50 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700">{col.label}</span>
                  <span className="text-[10px] font-semibold text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">
                    {col.cards.length}
                  </span>
                </div>
                <div className="flex-1 flex flex-col gap-1.5 p-2 overflow-y-auto">
                  {col.cards.length === 0 && (
                    <p className="text-[10px] text-gray-300 text-center py-6">없음</p>
                  )}
                  {col.cards.map((p) => {
                    const c = ownerColor(p.owner_id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => setOpenPlanId(p.id)}
                        className="text-left rounded-xl border border-gray-100 hover:border-periwinkle/40 hover:bg-periwinkle/5 transition-colors px-2.5 py-2"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0 ${c.chip}`}>
                            {p.owner_name}
                          </span>
                          <span className="text-[10px] text-gray-400 shrink-0">{MEDIA_META[p.media_type].label}</span>
                        </div>
                        <p className="text-xs text-gray-700 truncate">{p.topic || "(주제 미정)"}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {openPlanId !== null && (
        <PlanEditor
          planId={openPlanId}
          initialTab="content"
          onClose={() => setOpenPlanId(null)}
          onChanged={() => load({ soft: true })}
        />
      )}
    </div>
  );
}
