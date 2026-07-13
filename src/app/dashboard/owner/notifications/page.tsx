"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

/* ─── 타입 ─── */
interface Schedule {
  id: number;
  restaurant_id: number;
  restaurant_name: string;
  date: string;
  slot: "noon" | "evening";
  content: string;
  scheduled_datetime: string;
  sent: boolean;
  sent_at: string | null;
}

/* ─── 상수 ─── */
const SLOT_LABEL: Record<string, string> = {
  noon: "정오 12:00",
  evening: "저녁 18:00",
};
const SLOT_COLOR: Record<string, string> = {
  noon: "bg-amber-50 border-amber-200 text-amber-700",
  evening: "bg-indigo-50 border-indigo-200 text-indigo-700",
};
const SLOT_DOT: Record<string, string> = {
  noon: "bg-amber-400",
  evening: "bg-indigo-400",
};
const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

/* ─── 유틸 ─── */
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function startOfWeek(d: Date) {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay()); // 일요일 기준
  return r;
}
function isSameDate(a: string, b: string) {
  return a === b;
}
function fmtKST(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ═══════════════════════════════════════════════════════
   메인 컴포넌트
═══════════════════════════════════════════════════════ */
export default function OwnerNotificationsPage() {
  const searchParams = useSearchParams();
  const rid = searchParams.get("rid");

  const today = new Date();
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(today));
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  // 슬롯 추가 모달 상태
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState("");
  const [modalSlot, setModalSlot] = useState<"noon" | "evening">("noon");
  const [modalContent, setModalContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard/owner/notification-schedule?year=${year}&month=${month}`
      );
      if (res.ok) setSchedules(await res.json());
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  // 주간 이동 시 year/month 동기화
  useEffect(() => {
    const mid = addDays(weekStart, 3);
    setYear(mid.getFullYear());
    setMonth(mid.getMonth() + 1);
  }, [weekStart]);

  /* 슬롯 클릭 → 이미 예약이면 취소 확인, 없으면 등록 모달 */
  function handleSlotClick(dateStr: string, slot: "noon" | "evening") {
    const existing = schedules.find(
      (s) => isSameDate(s.date, dateStr) && s.slot === slot
    );
    if (existing) {
      if (existing.sent) return; // 발송 완료는 취소 불가
      if (!confirm(`${SLOT_LABEL[slot]} 알림 예약을 취소하시겠어요?`)) return;
      cancelSchedule(existing.id);
      return;
    }
    const d = new Date(dateStr + "T00:00:00");
    if (d < new Date(toDateStr(today) + "T00:00:00")) return; // 과거 차단
    setModalDate(dateStr);
    setModalSlot(slot);
    setModalContent("");
    setError("");
    setModalOpen(true);
  }

  async function cancelSchedule(id: number) {
    await fetch(`/api/dashboard/owner/notification-schedule/${id}`, {
      method: "DELETE",
    });
    load();
  }

  async function submitSchedule() {
    if (!modalContent.trim()) {
      setError("알림 내용을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard/owner/notification-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: modalDate,
          slot: modalSlot,
          content: modalContent.trim(),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.detail || "예약에 실패했습니다.");
        return;
      }
      setModalOpen(false);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  /* ─── 주간 캘린더 렌더 ─── */
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayStr = toDateStr(today);

  return (
    <div className="px-4 pt-4 pb-8 max-w-lg mx-auto">
      <h1 className="text-lg font-bold text-navy mb-1">알림 예약</h1>
      <p className="text-xs text-gray-400 mb-4">
        정오(12:00)·저녁(18:00) 두 시간대에 알림을 예약하면, 우리 식당을 찜한 사용자에게 자동 발송됩니다.
      </p>

      {/* 주간 네비게이션 */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-700">
          {weekStart.getMonth() + 1}월 {weekStart.getDate()}일 —{" "}
          {addDays(weekStart, 6).getMonth() + 1}월 {addDays(weekStart, 6).getDate()}일
        </span>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          ›
        </button>
      </div>

      {/* 캘린더 그리드 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {days.map((d) => {
            const ds = toDateStr(d);
            const isToday = ds === todayStr;
            const isPast = ds < todayStr;
            return (
              <div
                key={ds}
                className={`py-2 text-center text-xs font-medium ${
                  isToday ? "text-periwinkle" : isPast ? "text-gray-300" : "text-gray-500"
                }`}
              >
                <div>{DAY_KO[d.getDay()]}</div>
                <div
                  className={`mx-auto mt-0.5 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                    isToday ? "bg-periwinkle text-white" : ""
                  }`}
                >
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* 슬롯 행 */}
        {(["noon", "evening"] as const).map((slot) => (
          <div key={slot} className="grid grid-cols-7 border-b border-gray-50 last:border-0">
            {days.map((d) => {
              const ds = toDateStr(d);
              const isPast = ds < todayStr;
              const schedule = schedules.find(
                (s) => isSameDate(s.date, ds) && s.slot === slot
              );
              return (
                <button
                  key={ds}
                  onClick={() => handleSlotClick(ds, slot)}
                  disabled={isPast && !schedule}
                  className={`p-1.5 min-h-[52px] flex flex-col items-center justify-center gap-1 transition-colors border-r border-gray-50 last:border-0 ${
                    isPast ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50"
                  }`}
                >
                  {schedule ? (
                    <div
                      className={`w-full rounded-md px-1 py-1 text-center border ${
                        schedule.sent
                          ? "bg-gray-100 border-gray-200 text-gray-400"
                          : SLOT_COLOR[slot]
                      }`}
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full mx-auto mb-0.5 ${
                          schedule.sent ? "bg-gray-300" : SLOT_DOT[slot]
                        }`}
                      />
                      <p className="text-[9px] leading-tight font-medium line-clamp-2">
                        {schedule.content.split("\n")[0]}
                      </p>
                      {schedule.sent && (
                        <span className="text-[8px] text-gray-400">발송됨</span>
                      )}
                    </div>
                  ) : (
                    !isPast && (
                      <div className="text-[9px] text-gray-300 flex flex-col items-center gap-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${SLOT_DOT[slot]} opacity-30`} />
                        <span>{slot === "noon" ? "12시" : "18시"}</span>
                      </div>
                    )
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* 슬롯 범례 */}
      <div className="flex gap-4 mb-6 px-1">
        {(["noon", "evening"] as const).map((slot) => (
          <div key={slot} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${SLOT_DOT[slot]}`} />
            <span className="text-xs text-gray-500">{SLOT_LABEL[slot]}</span>
          </div>
        ))}
      </div>

      {/* 예약 리스트 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">예약 내역</h2>
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-400">불러오는 중…</div>
        ) : schedules.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">
            이번 달 예약된 알림이 없습니다
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {[...schedules]
              .sort(
                (a, b) =>
                  new Date(b.scheduled_datetime).getTime() -
                  new Date(a.scheduled_datetime).getTime()
              )
              .map((s) => (
                <div key={s.id} className="px-4 py-3 flex items-start gap-3">
                  <div
                    className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                      s.sent ? "bg-gray-300" : SLOT_DOT[s.slot]
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 mb-0.5">
                      {fmtKST(s.scheduled_datetime)} · {SLOT_LABEL[s.slot]}
                    </p>
                    <p className="text-sm text-gray-800 line-clamp-2">{s.content}</p>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    {s.sent ? (
                      <span className="text-[10px] bg-gray-100 text-gray-400 rounded-full px-2 py-0.5">
                        발송됨
                      </span>
                    ) : (
                      <>
                        <span
                          className={`text-[10px] rounded-full px-2 py-0.5 border ${SLOT_COLOR[s.slot]}`}
                        >
                          예약
                        </span>
                        <button
                          onClick={() => cancelSchedule(s.id)}
                          className="text-[10px] text-red-400 hover:text-red-600"
                        >
                          취소
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* 등록 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
          <div className="bg-white w-full max-w-lg rounded-t-2xl p-5 pb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-800">알림 예약 등록</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {modalDate} · {SLOT_LABEL[modalSlot]}
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* 슬롯 선택 */}
            <div className="flex gap-2 mb-4">
              {(["noon", "evening"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setModalSlot(s)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    modalSlot === s
                      ? SLOT_COLOR[s]
                      : "border-gray-200 text-gray-400"
                  }`}
                >
                  {SLOT_LABEL[s]}
                </button>
              ))}
            </div>

            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              알림 내용
            </label>
            <textarea
              value={modalContent}
              onChange={(e) => setModalContent(e.target.value)}
              placeholder={"첫 번째 줄이 알림 제목이 됩니다\n이후 내용은 본문으로 표시됩니다"}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-periwinkle h-28"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

            <button
              onClick={submitSchedule}
              disabled={submitting}
              className="mt-4 w-full py-3 bg-periwinkle text-white rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {submitting ? "예약 중…" : "예약 확정"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
