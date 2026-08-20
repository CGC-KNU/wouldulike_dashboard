"use client";

import { useEffect, useRef, useState } from "react";

import {
  ContentPlan,
  DuplicateMatch,
  MEDIA_META,
  MediaType,
  PlanStatus,
  SatelliteMember,
  STATUS_META,
  dowKR,
  fmtMD,
  ownerColor,
} from "./types";

/**
 * 주제 리스트 (DB 표) — 입력·목록·중복 확인 담당.
 * 여기에 입력하면 아래 캘린더가 자동으로 채워진다. (설계서 §07-1)
 *
 * 권한: 멤버는 본인 행만 편집, 리드는 전체 + 담당자 변경.
 * 프론트는 편집 UI를 가릴 뿐이고 최종 판정은 백엔드가 한다.
 */
export default function PlanTable({
  plans,
  members,
  viewerAccountId,
  isLead,
  today,
  onPatch,
  onDelete,
  onCreate,
  onOpen,
  busyId,
}: {
  plans: ContentPlan[];
  members: SatelliteMember[];
  viewerAccountId: number | null;
  isLead: boolean;
  today: string;
  onPatch: (id: number, body: Record<string, unknown>) => Promise<boolean>;
  onDelete: (id: number) => Promise<void>;
  onCreate: (body: Record<string, unknown>) => Promise<boolean>;
  onOpen: (plan: ContentPlan) => void;
  busyId: number | null;
}) {
  const [adding, setAdding] = useState(false);
  const [newDate, setNewDate] = useState(today);
  const [newTopic, setNewTopic] = useState("");
  const [newOwner, setNewOwner] = useState<number | "">(viewerAccountId ?? "");
  const [newMedia, setNewMedia] = useState<MediaType>("carousel");
  const [newShootOwner, setNewShootOwner] = useState<number | "">(viewerAccountId ?? "");
  const [newShootDate, setNewShootDate] = useState("");
  const [dupes, setDupes] = useState<DuplicateMatch[]>([]);
  const dupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeMembers = members.filter((m) => m.is_active);

  useEffect(() => {
    if (viewerAccountId && newOwner === "") setNewOwner(viewerAccountId);
  }, [viewerAccountId, newOwner]);

  /* 중복 주제 실시간 경고 — 차단이 아니라 경고 (설계서 §07-1) */
  useEffect(() => {
    if (dupTimer.current) clearTimeout(dupTimer.current);
    if (newTopic.trim().length < 2) {
      setDupes([]);
      return;
    }
    dupTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/satellite/plans/duplicate-check?topic=${encodeURIComponent(newTopic.trim())}`
        );
        if (res.ok) {
          const d = await res.json();
          setDupes(d.matches ?? []);
        }
      } catch {
        /* 경고는 부가 기능이므로 실패해도 조용히 넘어간다 */
      }
    }, 400);
    return () => {
      if (dupTimer.current) clearTimeout(dupTimer.current);
    };
  }, [newTopic]);

  function canEdit(p: ContentPlan) {
    return isLead || (viewerAccountId !== null && p.owner_id === viewerAccountId);
  }

  async function submitNew() {
    if (!newDate) return;
    const ok = await onCreate({
      scheduled_date: newDate,
      topic: newTopic.trim(),
      owner_id: newOwner || undefined,
      media_type: newMedia,
      shoot_owner_id: newShootOwner || undefined,
      shoot_date: newShootDate || undefined,
    });
    if (ok) {
      setNewTopic("");
      setNewShootDate("");
      setDupes([]);
      setAdding(false);
    }
  }

  /** 담당자·상태에 따라 버튼 라벨을 다르게 — 무엇을 하러 들어가는지 미리 알 수 있게 */
  function actionLabel(p: ContentPlan): string {
    const isMine = viewerAccountId !== null && (p.owner_id === viewerAccountId || p.shoot_owner_id === viewerAccountId);
    if (p.status === "published") return "성과 보기";
    if (isMine) return "작업하기";
    if (p.status === "draft") return "작업중";
    if (isLead) return "열람";
    return "피드백";
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-5 rounded-full bg-navy" />
          <div>
            <h3 className="text-sm font-bold text-gray-800">매거진 주제 리스트</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              협찬 촬영 정보와 주제를 한 행에 등록하면 아래 캘린더에 바로 반영됩니다 ·{" "}
              {isLead ? "전체 행을 수정할 수 있습니다" : "본인 담당 행만 수정할 수 있습니다"}
            </p>
          </div>
        </div>
        <span className="text-[11px] text-gray-400">{plans.length}건</span>
      </div>

      {/* 표 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[880px]">
          <thead>
            <tr className="text-[11px] text-gray-400 border-b border-gray-50">
              <th className="text-left font-semibold px-4 py-3 w-[128px]">업로드 날짜</th>
              <th className="text-left font-semibold px-3 py-3">매거진 주제</th>
              <th className="text-left font-semibold px-3 py-3 w-[128px]">담당자</th>
              <th className="text-left font-semibold px-3 py-3 w-[152px]">협찬 촬영</th>
              <th className="text-left font-semibold px-3 py-3 w-[108px]">유형</th>
              <th className="text-left font-semibold px-3 py-3 w-[116px]">상태</th>
              <th className="text-left font-semibold px-2 py-3 w-[64px]">카드</th>
              <th className="w-[128px]" />
            </tr>
          </thead>
          <tbody>
            {plans.length === 0 && !adding && (
              <tr>
                <td colSpan={8} className="text-center text-gray-300 py-8 text-xs">
                  이 달에 등록된 주제가 없습니다
                </td>
              </tr>
            )}

            {plans.map((p) => {
              const editable = canEdit(p);
              const c = ownerColor(p.owner_id);
              const st = STATUS_META[p.status];
              const busy = busyId === p.id;
              const isToday = p.scheduled_date === today;

              return (
                <tr
                  key={p.id}
                  className={`border-b border-gray-50 last:border-0 ${busy ? "opacity-50" : ""} ${
                    isToday ? "bg-periwinkle/[0.03]" : ""
                  }`}
                >
                  {/* 날짜 — 요일 함께 표기 */}
                  <td className="px-4 py-3">
                    {editable ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="date"
                          value={p.scheduled_date}
                          onChange={(e) => onPatch(p.id, { scheduled_date: e.target.value })}
                          className="text-xs text-gray-600 bg-transparent border-0 p-0 focus:outline-none cursor-pointer"
                        />
                        <span
                          className={`text-[10px] font-semibold shrink-0 ${
                            dowKR(p.scheduled_date) === "일"
                              ? "text-red-400"
                              : dowKR(p.scheduled_date) === "토"
                              ? "text-blue-400"
                              : "text-gray-400"
                          }`}
                        >
                          ({dowKR(p.scheduled_date)})
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">
                        {fmtMD(p.scheduled_date)} ({dowKR(p.scheduled_date)})
                      </span>
                    )}
                  </td>

                  {/* 주제 */}
                  <td className="px-3 py-3">
                    {editable ? (
                      <input
                        type="text"
                        defaultValue={p.topic}
                        placeholder="주제 입력"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== p.topic) onPatch(p.id, { topic: v });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        className="w-full text-xs text-gray-700 bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-periwinkle p-0 py-1 focus:outline-none transition-colors placeholder:text-gray-300"
                      />
                    ) : (
                      <span className={`text-xs ${p.topic ? "text-gray-700" : "text-gray-300"}`}>
                        {p.topic || "(미정)"}
                      </span>
                    )}
                  </td>

                  {/* 담당자 — 변경은 리드만 */}
                  <td className="px-3 py-3">
                    {isLead ? (
                      <select
                        value={p.owner_id}
                        onChange={(e) => onPatch(p.id, { owner_id: Number(e.target.value) })}
                        className={`text-[11px] font-bold rounded-full px-2.5 py-1.5 border-0 cursor-pointer ${c.chip} focus:outline-none focus:ring-1 focus:ring-periwinkle`}
                      >
                        {activeMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.display_name || m.username}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-[11px] font-bold rounded-full px-2.5 py-1.5 ${c.chip}`}>
                        {p.owner_name}
                      </span>
                    )}
                  </td>

                  {/* 협찬 촬영 — 촬영 담당자 · 촬영일 */}
                  <td className="px-3 py-3">
                    {editable ? (
                      <div className="flex flex-col gap-1">
                        <select
                          value={p.shoot_owner_id ?? ""}
                          onChange={(e) =>
                            onPatch(p.id, { shoot_owner_id: e.target.value ? Number(e.target.value) : null })
                          }
                          className="w-full text-[11px] text-gray-500 bg-transparent border-0 p-0 cursor-pointer focus:outline-none"
                        >
                          <option value="">촬영자 미정</option>
                          {activeMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.display_name || m.username}
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={p.shoot_date ?? ""}
                          onChange={(e) => onPatch(p.id, { shoot_date: e.target.value || null })}
                          className="w-full text-[11px] text-gray-400 bg-transparent border-0 p-0 focus:outline-none cursor-pointer"
                        />
                      </div>
                    ) : p.shoot_date || p.shoot_owner_name ? (
                      <span className="text-[11px] text-gray-400 leading-tight">
                        {p.shoot_owner_name ?? "미정"}
                        {p.shoot_date && <span className="block">{fmtMD(p.shoot_date)} ({dowKR(p.shoot_date)})</span>}
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-300">—</span>
                    )}
                  </td>

                  {/* 유형 */}
                  <td className="px-3 py-3">
                    {editable ? (
                      <select
                        value={p.media_type}
                        onChange={(e) => onPatch(p.id, { media_type: e.target.value })}
                        className="text-xs text-gray-600 bg-transparent border-0 p-0 cursor-pointer focus:outline-none"
                      >
                        {(Object.keys(MEDIA_META) as MediaType[]).map((k) => (
                          <option key={k} value={k}>
                            {MEDIA_META[k].label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-500">{MEDIA_META[p.media_type].label}</span>
                    )}
                  </td>

                  {/* 상태 — 멤버는 draft ↔ ready 만 */}
                  <td className="px-3 py-3">
                    {editable ? (
                      <select
                        value={p.status}
                        onChange={(e) => onPatch(p.id, { status: e.target.value })}
                        className={`text-[11px] font-semibold rounded-full px-2.5 py-1.5 border cursor-pointer ${st.cls} focus:outline-none`}
                      >
                        {(isLead
                          ? (Object.keys(STATUS_META) as PlanStatus[])
                          : (["draft", "ready"] as PlanStatus[])
                        ).map((k) => (
                          <option key={k} value={k}>
                            {STATUS_META[k].label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-[11px] font-semibold rounded-full px-2.5 py-1.5 border ${st.cls}`}>
                        {st.label}
                      </span>
                    )}
                  </td>

                  {/* 카드 장수 */}
                  <td className="px-2 py-3">
                    <span
                      className={`text-xs ${
                        p.card_count > 10
                          ? "text-red-500 font-bold"
                          : p.card_count > 0
                          ? "text-gray-500"
                          : "text-gray-300"
                      }`}
                    >
                      {p.card_count > 0 ? `${p.card_count}장` : "—"}
                    </span>
                  </td>

                  {/* 작업하기 · 삭제 */}
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        onClick={() => onOpen(p)}
                        title="이 주제로 작업 화면 열기"
                        className="text-[11px] font-semibold rounded-full px-3 py-2 min-h-[36px] bg-periwinkle/10 text-periwinkle hover:bg-periwinkle hover:text-white active:scale-95 transition-all whitespace-nowrap"
                      >
                        {actionLabel(p)}
                      </button>
                      {editable && p.status !== "published" && (
                        <button
                          onClick={() => {
                            if (confirm(`${fmtMD(p.scheduled_date)} "${p.topic || "(미정)"}" 삭제할까요?`)) {
                              onDelete(p.id);
                            }
                          }}
                          aria-label="삭제"
                          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* 행 추가 */}
            {adding && (
              <tr className="bg-periwinkle/[0.04]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="flex-1 min-w-0 text-[11px] text-gray-700 bg-white border border-gray-200 rounded-md px-1.5 py-1.5 focus:outline-none focus:border-periwinkle"
                    />
                    {newDate && <span className="text-[10px] text-gray-400 shrink-0">({dowKR(newDate)})</span>}
                  </div>
                </td>
                <td className="px-2 py-2">
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
                    className="w-full text-xs text-gray-700 bg-white border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:border-periwinkle placeholder:text-gray-300"
                  />
                </td>
                <td className="px-2 py-2">
                  <select
                    value={newOwner}
                    onChange={(e) => setNewOwner(Number(e.target.value))}
                    disabled={!isLead}
                    className="w-full text-[11px] text-gray-700 bg-white border border-gray-200 rounded-md px-1 py-1 focus:outline-none focus:border-periwinkle disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    {activeMembers.length === 0 && <option value="">계정 없음</option>}
                    {activeMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name || m.username}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-col gap-1">
                    <select
                      value={newShootOwner}
                      onChange={(e) => setNewShootOwner(e.target.value ? Number(e.target.value) : "")}
                      className="w-full text-[10px] text-gray-700 bg-white border border-gray-200 rounded-md px-1 py-1 focus:outline-none focus:border-periwinkle"
                    >
                      <option value="">촬영자 미정</option>
                      {activeMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.display_name || m.username}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={newShootDate}
                      onChange={(e) => setNewShootDate(e.target.value)}
                      className="w-full text-[10px] text-gray-700 bg-white border border-gray-200 rounded-md px-1 py-1 focus:outline-none focus:border-periwinkle"
                    />
                  </div>
                </td>
                <td className="px-2 py-2">
                  <select
                    value={newMedia}
                    onChange={(e) => setNewMedia(e.target.value as MediaType)}
                    className="w-full text-[11px] text-gray-700 bg-white border border-gray-200 rounded-md px-1 py-1 focus:outline-none focus:border-periwinkle"
                  >
                    {(Object.keys(MEDIA_META) as MediaType[]).map((k) => (
                      <option key={k} value={k}>
                        {MEDIA_META[k].label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2" colSpan={3}>
                  <div className="flex gap-1">
                    <button
                      onClick={submitNew}
                      className="flex-1 text-[11px] font-semibold bg-periwinkle text-white rounded-md px-2 py-1.5 hover:bg-navy transition-colors"
                    >
                      등록
                    </button>
                    <button
                      onClick={() => {
                        setAdding(false);
                        setNewTopic("");
                        setDupes([]);
                      }}
                      className="text-[11px] text-gray-400 px-2 py-1.5 hover:text-gray-600"
                    >
                      취소
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 중복 주제 경고 */}
      {adding && dupes.length > 0 && (
        <div className="mx-3 mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-[10px] font-bold text-amber-700 mb-1.5">
            비슷한 주제가 최근 90일 안에 있습니다 — 등록은 가능합니다
          </p>
          <div className="flex flex-col gap-1">
            {dupes.slice(0, 4).map((d) => (
              <div key={d.id} className="flex items-center gap-1.5 text-[11px]">
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded font-semibold ${
                    d.severity === "high" ? "bg-amber-200 text-amber-800" : "bg-amber-100 text-amber-600"
                  }`}
                >
                  {d.same_week ? "같은 주" : fmtMD(d.scheduled_date)}
                </span>
                <span className="text-amber-700 truncate">{d.topic}</span>
                <span className="text-amber-500 shrink-0">· {d.owner_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-1.5 py-3 text-[11px] font-semibold text-gray-400 hover:text-periwinkle border-t border-gray-50 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          행 추가
        </button>
      )}
    </div>
  );
}
