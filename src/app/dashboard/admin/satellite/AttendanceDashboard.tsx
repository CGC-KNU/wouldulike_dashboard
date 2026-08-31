"use client";

import { useCallback, useEffect, useState } from "react";

import { AttendanceResponse, AttendanceRow, fmtMD } from "./types";

/**
 * 멤버별 근태 표 (설계서 §16-6, §16-7) — 리드 전용.
 *
 * 절대 원칙: 정시/지각 판정은 ready_at(잠긴 이력) 만 근거로 한다. 발행 성공/실패는
 * publish_failed_ref 로 참고만 하고 판정에 섞지 않는다 — 화면에도 별도 회색 컬럼으로 둔다.
 */
interface Props {
  onClose: () => void;
  /** true면 모달 오버레이 없이 사이드바 콘텐츠 영역에 바로 얹는 패널로 렌더링한다 */
  embedded?: boolean;
}

/** 오늘 기준 weekOffset(0=이번 주, -1=지난 주 ...)만큼 이동한, 그 주 안의 아무 날짜(YYYY-MM-DD).
 * 백엔드 _week_bounds()가 이 날짜가 속한 주의 월~일을 알아서 계산하므로 정확히
 * 월요일일 필요는 없다. */
function weekAnchorDate(weekOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + weekOffset * 7);
  return d.toISOString().slice(0, 10);
}

export default function AttendanceDashboard({ onClose, embedded = false }: Props) {
  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [savingPlanId, setSavingPlanId] = useState<number | null>(null);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/satellite/attendance?week_start=${weekAnchorDate(weekOffset)}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.detail ?? `불러오지 못했습니다 (${res.status})`);
        setData(null);
      } else {
        setData(d);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      if (!opts?.soft) setLoading(false);
    }
  }, [weekOffset]);

  async function setOverride(planId: number, override: "on_time" | "late" | "") {
    setSavingPlanId(planId);
    try {
      const res = await fetch(`/api/satellite/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendance_override: override || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.detail ?? "저장에 실패했습니다.");
        return;
      }
      await load({ soft: true });
    } catch {
      alert("네트워크 오류");
    } finally {
      setSavingPlanId(null);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  const body = (
    <>
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0 gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-800">근태</h2>
          {data && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              {data.week_start} ~ {data.week_end}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setWeekOffset((v) => v - 1)}
            aria-label="지난 주"
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors active:scale-90"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M15 19L9 12l6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-[10px] font-semibold text-gray-400 hover:text-periwinkle px-1.5 py-1 rounded-lg hover:bg-gray-50"
            >
              이번 주
            </button>
          )}
          <button
            onClick={() => setWeekOffset((v) => v + 1)}
            aria-label="다음 주"
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors active:scale-90"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M9 19l6-7-6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {!embedded && (
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {err && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 mb-3">
            <p className="text-[11px] text-red-600">{err}</p>
          </div>
        )}

        {loading ? (
          <p className="text-xs text-gray-300 text-center py-8">불러오는 중...</p>
        ) : data ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-gray-400 border-b border-gray-100">
                <th className="text-left font-medium py-2">이름</th>
                <th className="text-right font-medium py-2">할당량</th>
                <th className="text-right font-medium py-2">등록</th>
                <th className="text-right font-medium py-2 text-green-600">정시</th>
                <th className="text-right font-medium py-2 text-red-500">마감 지연</th>
                <th className="text-right font-medium py-2">일정변경</th>
                <th className="text-right font-medium py-2 text-gray-300">발행실패(참고)</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <AttendanceRowLine
                  key={r.account_id}
                  row={r}
                  expanded={expandedId === r.account_id}
                  onToggleExpand={() =>
                    setExpandedId((v) => (v === r.account_id ? null : r.account_id))
                  }
                  savingPlanId={savingPlanId}
                  onOverride={setOverride}
                />
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </>
  );

  if (embedded) {
    return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">{body}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-xl">
        {body}
      </div>
    </div>
  );
}

function AttendanceRowLine({
  row,
  expanded,
  onToggleExpand,
  savingPlanId,
  onOverride,
}: {
  row: AttendanceRow;
  expanded: boolean;
  onToggleExpand: () => void;
  savingPlanId: number | null;
  onOverride: (planId: number, override: "on_time" | "late" | "") => void;
}) {
  const hasLate = row.late > 0;
  return (
    <>
      <tr className="border-b border-gray-50">
        <td className="py-2">
          <span className={row.is_active ? "text-gray-700 font-medium" : "text-gray-300"}>{row.name}</span>
          {row.not_registered && (
            <span className="ml-1.5 text-[9px] font-bold text-amber-500 bg-amber-50 rounded-full px-1.5 py-0.5">
              미등록
            </span>
          )}
        </td>
        <td className="text-right py-2 text-gray-400">{row.weekly_quota}</td>
        <td className="text-right py-2 text-gray-600">{row.registered}</td>
        <td className="text-right py-2 text-green-600 font-semibold">{row.on_time}</td>
        <td className="text-right py-2">
          {hasLate ? (
            <button
              onClick={onToggleExpand}
              className="font-semibold text-red-500 underline decoration-dotted underline-offset-2 hover:text-red-600"
              title="클릭해서 지연 건 목록 보기"
            >
              {row.late}
            </button>
          ) : (
            <span className="text-red-500 font-semibold">-</span>
          )}
        </td>
        <td className="text-right py-2 text-gray-500">{row.edit_requests || "-"}</td>
        <td className="text-right py-2 text-gray-300">{row.publish_failed_ref || "-"}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-50 bg-red-50/30">
          <td colSpan={7} className="py-2 px-2">
            {row.late_plans.length === 0 ? (
              <p className="text-[11px] text-gray-400 py-1">지연 건이 없습니다.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {row.late_plans.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 bg-white rounded-lg border border-red-100 px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-700 truncate">{p.topic || "(주제 미정)"}</p>
                      <p className="text-[10px] text-gray-400">
                        업로드 {fmtMD(p.scheduled_date)}
                        {p.deadline && ` · 마감 ${fmtMD(p.deadline.slice(0, 10))}`}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {(
                        [
                          { value: "", label: "자동 판정" },
                          { value: "on_time", label: "정시로 인정" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          disabled={savingPlanId === p.id}
                          onClick={() => onOverride(p.id, opt.value)}
                          className={`text-[10px] font-semibold rounded-lg px-2 py-1.5 border transition-colors disabled:opacity-40 ${
                            (p.attendance_override ?? "") === opt.value
                              ? "bg-periwinkle text-white border-periwinkle"
                              : "text-gray-500 border-gray-200 hover:border-periwinkle/40"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
