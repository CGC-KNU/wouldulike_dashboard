"use client";

import { useCallback, useEffect, useState } from "react";

import { AttendanceResponse, AttendanceRow } from "./types";

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

export default function AttendanceDashboard({ onClose, embedded = false }: Props) {
  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/satellite/attendance");
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const body = (
    <>
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-bold text-gray-800">근태</h2>
          {data && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              {data.week_start} ~ {data.week_end}
            </p>
          )}
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
                <AttendanceRowLine key={r.account_id} row={r} />
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

function AttendanceRowLine({ row }: { row: AttendanceRow }) {
  return (
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
      <td className="text-right py-2 text-red-500 font-semibold">{row.late || "-"}</td>
      <td className="text-right py-2 text-gray-500">{row.edit_requests || "-"}</td>
      <td className="text-right py-2 text-gray-300">{row.publish_failed_ref || "-"}</td>
    </tr>
  );
}
