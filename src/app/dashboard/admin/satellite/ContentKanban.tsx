"use client";

import { useCallback, useEffect, useState } from "react";

import AssigneePicker from "./AssigneePicker";
import { DeleteConfirmModal } from "./PlanTable";
import PlanEditor from "./PlanEditor";
import { ContentPlan, KanbanResponse, MEDIA_META, MediaType, SatelliteMember, fmtMD, ownerColor } from "./types";

/**
 * 콘텐츠 칸반 (통합 업무 관리 기획안 §5) — 업무 목록 / 피드백 대기 / 완료.
 *
 * 협찬은 여기 없다 — Sponsorship 으로 완전히 분리됐다(§2-2, "협찬" 사이드바 메뉴 참고,
 * 2026-08-23부터 메인 화면 맨 위에도 표시됨).
 *
 * 상태 전이(업무목록→피드백대기→완료)는 기본적으로 자동이다(§6①② — 담당자가 에디터에서
 * 작업물 등록을 마치면 자동으로 피드백 대기, 업로드 예정 시간이 되면 자동으로 완료).
 * "완료"는 실제 발행 성공(status=published)에서만 나오는 값이라 드래그로 흉내 낼 수
 * 없지만, "업무 목록 ↔ 피드백 대기"는 에디터의 "준비완료로 전환"/"다시 작업중으로"와
 * 같은 API라 드래그로도 옮길 수 있다(2026-08-23, RD 요청). 카드를 클릭하면 PlanEditor 가
 * "에디터" 탭으로 열리는 걸 우선 시도한다 — 본인 담당 건이 아니면 PlanEditor 자체의
 * 안전장치가 "콘텐츠 피드백" 탭으로 되돌린다(§7·§8).
 */
export default function ContentKanban({
  members,
  viewerAccountId,
  isLead,
  today,
  onCreate,
  onDelete,
}: {
  members: SatelliteMember[];
  viewerAccountId: number | null;
  isLead: boolean;
  today: string;
  onCreate: (body: Record<string, unknown>) => Promise<boolean>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [data, setData] = useState<KanbanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [openPlanId, setOpenPlanId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentPlan | null>(null);

  const [adding, setAdding] = useState(false);
  const [newDate, setNewDate] = useState(today);
  const [newTopic, setNewTopic] = useState("");
  const [newOwner, setNewOwner] = useState<number | null>(viewerAccountId ?? null);
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newMedia, setNewMedia] = useState<MediaType>("carousel");
  const [creating, setCreating] = useState(false);
  // 담당자(편집 담당) 후보 — 활성 계정 + 배정 가능(satellite_assignable) 만.
  // 리드라도 이게 꺼져 있으면 열람 전용이라 이 목록엔 안 뜬다(RD 요청 2026-08-26).
  const activeMembers = members.filter((m) => m.is_active && m.satellite_assignable);

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
    // 열람 전용 계정(리드라도 satellite_assignable=false)은 자기 자신으로 기본
    // 지정되면 안 된다 — 어차피 서버가 거부하지만, 담당자 목록에도 안 뜨는데
    // 자동으로 선택돼 있으면 혼란스럽다.
    if (viewerAccountId && newOwner === null && !newOwnerName && activeMembers.some((m) => m.id === viewerAccountId)) {
      setNewOwner(viewerAccountId);
    }
  }, [viewerAccountId, newOwner, newOwnerName, activeMembers]);

  async function submitNew() {
    if (!newDate) return;
    setCreating(true);
    try {
      const ok = await onCreate({
        scheduled_date: newDate,
        topic: newTopic.trim(),
        owner_id: newOwner ?? undefined,
        owner_name_override: newOwnerName.trim() || undefined,
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

  /**
   * 드래그로 옮길 수 있는 건 "업무 목록" ↔ "피드백 대기" 뿐이다. "완료"는
   * pipeline_stage 프로퍼티가 실제 발행 성공(status=published)에서만 파생되는 값이라
   * (satellite/models.py ContentPlan.pipeline_stage) 드래그로 흉내 낼 수 없다 —
   * 억지로 옮기면 화면 라벨과 실제 status가 어긋나는 상태가 된다.
   *
   * 업무목록→피드백대기는 에디터의 "준비완료로 전환"과 완전히 같은 API
   * (POST .../ready/, 카드10장·해시태그5개 검증 포함)를 그대로 호출하고, 반대 방향은
   * 그 반대 API(DELETE .../ready/, ready/scheduled 상태에서만 허용)를 호출한다 —
   * 새 백엔드 로직 없이 기존에 검증된 전이만 재사용한다.
   */
  const DRAGGABLE_STAGES = new Set(["todo", "feedback"]);

  async function movePlan(planId: number, from: string, to: string) {
    if (from === to) return;
    if (!DRAGGABLE_STAGES.has(from) || !DRAGGABLE_STAGES.has(to)) {
      alert('"완료"는 실제 발행에 성공해야 자동으로 반영됩니다 — 드래그로는 옮길 수 없습니다.');
      return;
    }
    try {
      const res = await fetch(`/api/satellite/plans/${planId}/ready`, {
        method: to === "feedback" ? "POST" : "DELETE",
        headers: to === "feedback" ? { "Content-Type": "application/json" } : undefined,
        body: to === "feedback" ? JSON.stringify({}) : undefined,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const problems = Array.isArray(d.problems) ? `\n\n· ${d.problems.join("\n· ")}` : "";
        alert(`${d.detail ?? "이동에 실패했습니다."}${problems}`);
        return;
      }
      load({ soft: true });
    } catch {
      alert("네트워크 오류");
    }
  }

  /** 발행완료는 리드만, 그 외는 리드 또는 본인 담당만 — 백엔드 delete() 규칙과 동일(§0-15). */
  function canDelete(p: ContentPlan): boolean {
    if (p.status === "published") return isLead;
    return isLead || (viewerAccountId !== null && (p.owner_id === viewerAccountId || p.shoot_owner_id === viewerAccountId));
  }

  const showInitialSpinner = loading && !data;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-gray-800">콘텐츠 칸반</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              업무 목록 ↔ 피드백 대기는 카드를 드래그해서 옮길 수 있습니다 (완료는 실제 발행 성공 시 자동으로만 반영). 클릭하면 에디터가 열립니다.
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
          <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/60 flex flex-col md:flex-row md:flex-wrap gap-2">
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
            <div className="md:w-36">
              <AssigneePicker
                members={activeMembers}
                accountId={newOwner}
                nameOverride={newOwnerName}
                onChange={(id, name) => {
                  setNewOwner(id);
                  setNewOwnerName(name);
                }}
                disabled={!isLead}
                unassignedLabel="담당자"
              />
            </div>
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
            {newMedia === "image" && (
              <p className="basis-full text-[10px] text-gray-400 leading-relaxed">
                기타는 인스타 발행이 아니라, 카드뉴스 주제 정리·학생회 단톡에 뿌릴 글처럼 자료를 모아 두는 용도입니다.
              </p>
            )}
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
                <div
                  onDragOver={(e) => DRAGGABLE_STAGES.has(col.key) && e.preventDefault()}
                  onDrop={(e) => {
                    if (!DRAGGABLE_STAGES.has(col.key)) return;
                    e.preventDefault();
                    const raw = e.dataTransfer.getData("text/plan-id");
                    const from = e.dataTransfer.getData("text/plan-stage");
                    const id = Number(raw);
                    if (id) movePlan(id, from, col.key);
                  }}
                  className="flex-1 flex flex-col gap-1.5 p-2 overflow-y-auto"
                >
                  {col.cards.length === 0 && (
                    <p className="text-[10px] text-gray-300 text-center py-6">없음</p>
                  )}
                  {col.cards.map((p) => {
                    const c = ownerColor(p.owner_id);
                    const draggableHere = DRAGGABLE_STAGES.has(col.key);
                    const deletable = canDelete(p);
                    return (
                      <div key={p.id} className="relative group">
                        <button
                          draggable={draggableHere}
                          onDragStart={(e) => {
                            if (!draggableHere) return;
                            e.dataTransfer.setData("text/plan-id", String(p.id));
                            e.dataTransfer.setData("text/plan-stage", col.key);
                          }}
                          onClick={() => setOpenPlanId(p.id)}
                          className={`w-full text-left rounded-xl border border-gray-100 hover:border-periwinkle/40 hover:bg-periwinkle/5 transition-colors px-2.5 py-2 ${
                            deletable ? "pr-7" : ""
                          } ${draggableHere ? "cursor-grab active:cursor-grabbing" : ""}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0 ${c.chip}`}>
                              {p.owner_name}
                            </span>
                            <span className="text-[10px] text-gray-400 shrink-0">{MEDIA_META[p.media_type].label}</span>
                          </div>
                          <p className="text-xs text-gray-700 truncate">{p.topic || "(주제 미정)"}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] text-gray-400">
                              업로드 {fmtMD(p.scheduled_date)}
                              {p.desired_publish_at && ` ${new Date(p.desired_publish_at).getHours()}시`}
                            </span>
                            {p.deadline && (
                              <span className="text-[10px] text-amber-500">마감 {fmtMD(p.deadline.slice(0, 10))}</span>
                            )}
                          </div>
                        </button>
                        {deletable && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(p);
                            }}
                            aria-label="삭제"
                            title="삭제"
                            className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-md text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                            </svg>
                          </button>
                        )}
                      </div>
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

      {deleteTarget && (
        <DeleteConfirmModal
          plan={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirmed={async () => {
            await onDelete(deleteTarget.id);
            setDeleteTarget(null);
            load({ soft: true });
          }}
        />
      )}
    </div>
  );
}
