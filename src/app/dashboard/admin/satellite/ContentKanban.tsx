"use client";

import { useCallback, useEffect, useState } from "react";

import PlanEditor from "./PlanEditor";
import { KanbanResponse, MEDIA_META, ownerColor } from "./types";

/**
 * 콘텐츠 칸반 (통합 업무 관리 기획안 §5) — 업무 목록 / 피드백 대기 / 완료.
 *
 * 협찬은 여기 없다 — Sponsorship 으로 완전히 분리됐다(§2-2, "협찬" 사이드바 메뉴 참고).
 * 상태 전이가 전부 자동이라(§6①② — 담당자가 에디터에서 작업물 등록을 마치면 자동으로
 * 피드백 대기, 업로드 예정 시간이 되면 자동으로 완료) 드래그앤드롭이 필요 없다. 카드를
 * 클릭하면 항상 "콘텐츠 피드백" 탭으로 PlanEditor 가 열린다 — 본인 담당 건이면 그 안에서
 * "에디터" 탭으로 직접 넘어갈 수 있고, 비담당자는 피드백만 남길 수 있다(§7·§8).
 */
export default function ContentKanban() {
  const [data, setData] = useState<KanbanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [openPlanId, setOpenPlanId] = useState<number | null>(null);

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

  const showInitialSpinner = loading && !data;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <h2 className="text-sm font-bold text-gray-800">콘텐츠 칸반</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            업무 목록 → 피드백 대기 → 완료 — 상태는 자동으로 넘어갑니다. 카드를 클릭하면 열람·피드백 화면이 열립니다.
          </p>
        </div>

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
          initialTab="detail"
          onClose={() => setOpenPlanId(null)}
          onChanged={() => load({ soft: true })}
        />
      )}
    </div>
  );
}
