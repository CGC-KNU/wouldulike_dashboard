"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ContentPlan,
  KanbanResponse,
  PIPELINE_STAGE_META,
  PipelineStage,
  SatelliteMember,
  fmtMD,
} from "./types";

interface Props {
  members: SatelliteMember[];
  viewerAccountId: number | null;
  isLead: boolean;
  onOpen: (plan: ContentPlan) => void;
  /** PlanTable/PlanCalendar 와 같은 PATCH 헬퍼를 그대로 재사용 — 성공하면 true */
  onPatch: (id: number, body: Record<string, unknown>) => Promise<boolean>;
  onCreate: (body: Record<string, unknown>) => Promise<boolean>;
  refreshToken: number; // 부모에서 다른 경로로 plans 가 바뀌었을 때 재조회 트리거
}

const COLUMN_ORDER: PipelineStage[] = ["sponsorship", "editing", "uploaded"];

export default function KanbanBoard({ members, viewerAccountId, isLead, onOpen, onPatch, onCreate, refreshToken }: Props) {
  const [data, setData] = useState<KanbanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/satellite/kanban");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  async function handleCreate(shoot_owner_id: number, shoot_date: string, topic: string) {
    const ok = await onCreate({ shoot_owner_id, shoot_date, topic });
    if (ok) {
      setShowNew(false);
      load();
    }
  }

  /** 드래그로 칸을 옮기면 판정 기준(shoot_date/status)을 그 칸에 맞게 조정한다. */
  async function moveToColumn(plan: ContentPlan, target: PipelineStage) {
    if (plan.pipeline_stage === target) return;
    const today = data?.today ?? new Date().toISOString().slice(0, 10);
    if (target === "sponsorship") {
      // 편집중/업로드완료 → 협찬목록 되돌리기: 촬영일을 내일로 미룬다
      const tmr = new Date(today);
      tmr.setDate(tmr.getDate() + 1);
      await onPatch(plan.id, { shoot_date: tmr.toISOString().slice(0, 10), status: "draft" });
    } else if (target === "editing") {
      // 협찬목록 → 편집중: 촬영일을 오늘 이전으로, 업로드완료 → 편집중이면 상태를 되돌린다
      const body: Record<string, unknown> = { shoot_date: today };
      if (plan.status === "published") body.status = "draft";
      await onPatch(plan.id, body);
    } else {
      // → 업로드완료: 실제 발행은 에디터/발행 파이프라인에서 하는 게 정석이지만,
      // 수동 이동 요청(드래그앤드롭)이 들어오면 리드 권한으로 상태만 맞춰준다.
      if (!isLead) {
        alert("업로드완료로의 수동 이동은 리드만 할 수 있습니다. 에디터에서 실제 발행을 진행해주세요.");
        return;
      }
      await onPatch(plan.id, { status: "published" });
    }
    load();
  }

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
        <p className="text-xs text-gray-300">칸반 보드 불러오는 중...</p>
      </div>
    );
  }
  if (!data) return null;

  const byKey = new Map(data.columns.map((c) => [c.key, c]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-400">
          촬영일 기준 자동 이동 — 필요하면 카드를 다른 칸으로 끌어다 놓아 수동으로 옮길 수 있습니다.
        </p>
        <button
          onClick={() => setShowNew(true)}
          className="text-[11px] font-semibold text-white bg-periwinkle rounded-lg px-3 py-1.5 hover:opacity-90 active:scale-95 transition-all"
        >
          + 새 협찬 등록
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {COLUMN_ORDER.map((key) => {
          const col = byKey.get(key);
          const meta = PIPELINE_STAGE_META[key];
          return (
            <div
              key={key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const plan = col?.cards.find((c) => c.id === dragId) ?? data.columns.flatMap((c) => c.cards).find((c) => c.id === dragId);
                if (plan) moveToColumn(plan, key);
                setDragId(null);
              }}
              className="bg-gray-50 rounded-2xl border border-gray-100 p-3 flex flex-col gap-2 min-h-[200px]"
            >
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.cls}`}>
                  {meta.label}
                </span>
                <span className="text-[10px] text-gray-400">{col?.cards.length ?? 0}건</span>
              </div>

              <div className="flex flex-col gap-2">
                {(col?.cards ?? []).map((p) => (
                  <KanbanCard
                    key={p.id}
                    plan={p}
                    isMine={viewerAccountId !== null && (p.owner_id === viewerAccountId || p.shoot_owner_id === viewerAccountId)}
                    onOpen={() => onOpen(p)}
                    onDragStart={() => setDragId(p.id)}
                  />
                ))}
                {(col?.cards.length ?? 0) === 0 && (
                  <p className="text-[10px] text-gray-300 text-center py-6">없음</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showNew && (
        <NewSponsorshipModal
          members={members}
          onClose={() => setShowNew(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

function KanbanCard({
  plan,
  isMine,
  onOpen,
  onDragStart,
}: {
  plan: ContentPlan;
  isMine: boolean;
  onOpen: () => void;
  onDragStart: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className={`bg-white rounded-xl border px-3 py-2.5 cursor-pointer hover:shadow-sm transition-all ${
        isMine ? "border-periwinkle/40" : "border-gray-100"
      }`}
    >
      <p className="text-xs font-semibold text-gray-800 truncate">{plan.topic || "(주제 미정)"}</p>
      <div className="mt-1 flex flex-col gap-0.5 text-[10px] text-gray-400">
        {plan.shoot_date && (
          <span>
            촬영 {fmtMD(plan.shoot_date)} · {plan.shoot_owner_name ?? "미지정"}
          </span>
        )}
        <span>
          업로드 {fmtMD(plan.scheduled_date)} · {plan.owner_name}
        </span>
      </div>
      {plan.status === "locked" && (
        <span className="mt-1 inline-block text-[9px] font-semibold text-red-500">마감 지연</span>
      )}
    </div>
  );
}

function NewSponsorshipModal({
  members,
  onClose,
  onCreate,
}: {
  members: { id: number; display_name: string; is_active: boolean }[];
  onClose: () => void;
  onCreate: (shootOwnerId: number, shootDate: string, topic: string) => void;
}) {
  const [shootOwnerId, setShootOwnerId] = useState<number | "">("");
  const [shootDate, setShootDate] = useState(new Date().toISOString().slice(0, 10));
  const [topic, setTopic] = useState("");

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 flex flex-col gap-3">
        <h3 className="text-sm font-bold text-gray-800">새 협찬 등록</h3>

        <label className="text-[11px] font-medium text-gray-500">
          제목 (가게명 등)
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5"
            placeholder="예: OO식당 협찬"
          />
        </label>

        <label className="text-[11px] font-medium text-gray-500">
          촬영 담당자
          <select
            value={shootOwnerId}
            onChange={(e) => setShootOwnerId(e.target.value ? Number(e.target.value) : "")}
            className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5"
          >
            <option value="">선택</option>
            {members.filter((m) => m.is_active).map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[11px] font-medium text-gray-500">
          촬영 날짜
          <input
            type="date"
            value={shootDate}
            onChange={(e) => setShootDate(e.target.value)}
            className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5"
          />
        </label>

        <div className="flex items-center justify-end gap-2 mt-2">
          <button onClick={onClose} className="text-[11px] text-gray-400 px-3 py-1.5">
            취소
          </button>
          <button
            disabled={!shootOwnerId || !shootDate}
            onClick={() => shootOwnerId && onCreate(shootOwnerId, shootDate, topic)}
            className="text-[11px] font-semibold text-white bg-periwinkle rounded-lg px-3 py-1.5 disabled:opacity-40"
          >
            등록
          </button>
        </div>
      </div>
    </div>
  );
}
