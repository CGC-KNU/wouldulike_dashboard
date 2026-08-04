"use client";

import {
  ContentPlan,
  DAY_KR,
  MEDIA_META,
  SatelliteMember,
  STATUS_META,
  ownerColor,
} from "./types";

/**
 * 월간 캘린더 — 주제표와 같은 데이터(ContentPlan)의 두 번째 얼굴.
 * 표는 입력·목록·중복 확인에 강하고, 캘린더는 분포 파악에 강하다. (설계서 §07-1)
 */
export default function PlanCalendar({
  year,
  month,
  today,
  plans,
  members,
  onPrev,
  onNext,
  onToday,
  onSelect,
  onDropOnDate,
}: {
  year: number;
  month: number;
  today: string;
  plans: ContentPlan[];
  members: SatelliteMember[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelect: (plan: ContentPlan) => void;
  onDropOnDate: (planId: number, dateStr: string) => void;
}) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const dateStr = (day: number) =>
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const byDate = new Map<string, ContentPlan[]>();
  plans.forEach((p) => {
    const arr = byDate.get(p.scheduled_date) ?? [];
    arr.push(p);
    byDate.set(p.scheduled_date, arr);
  });

  // 이 달에 등장한 담당자만 범례에 표시
  const activeOwnerIds = Array.from(new Set(plans.map((p) => p.owner_id)));
  const memberById = new Map(members.map((m) => [m.id, m]));

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-5 rounded-full bg-periwinkle" />
          <h3 className="text-sm font-bold text-gray-800">{monthLabel}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToday}
            className="text-[11px] font-semibold text-gray-400 hover:text-periwinkle px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors"
          >
            오늘
          </button>
          <button
            onClick={onPrev}
            aria-label="이전 달"
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors active:scale-90"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M15 19L9 12l6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={onNext}
            aria-label="다음 달"
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors active:scale-90"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M9 19l6-7-6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* 그리드 */}
      <div className="px-3 pt-2 pb-3">
        <div className="grid grid-cols-7 mb-1">
          {DAY_KR.map((d, i) => (
            <div
              key={d}
              className={`text-center text-[10px] font-semibold py-1 ${
                i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-400"
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.map((day, di) => {
                if (!day) return <div key={di} className="min-h-[68px]" />;
                const ds = dateStr(day);
                const dayPlans = byDate.get(ds) ?? [];
                const isToday = ds === today;

                return (
                  <div
                    key={di}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = Number(e.dataTransfer.getData("text/plan-id"));
                      if (id) onDropOnDate(id, ds);
                    }}
                    className={`min-h-[68px] rounded-xl border p-1 flex flex-col gap-0.5 transition-colors ${
                      isToday
                        ? "border-periwinkle/40 bg-periwinkle/[0.04]"
                        : "border-gray-100 hover:border-gray-200 hover:bg-gray-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between px-0.5">
                      <span
                        className={`text-[10px] leading-none ${
                          isToday
                            ? "font-black text-navy"
                            : di === 0
                            ? "text-red-400"
                            : di === 6
                            ? "text-blue-400"
                            : "text-gray-400"
                        }`}
                      >
                        {day}
                      </span>
                      {isToday && <span className="w-1.5 h-1.5 rounded-full bg-periwinkle" />}
                    </div>

                    {dayPlans.map((p) => {
                      const c = ownerColor(p.owner_id);
                      const st = STATUS_META[p.status];
                      return (
                        <button
                          key={p.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plan-id", String(p.id))}
                          onClick={() => onSelect(p)}
                          title={`${p.owner_name} · ${p.topic || "(미정)"} · ${st.label} · ${MEDIA_META[p.media_type].label}`}
                          className={`w-full text-left rounded-lg px-1.5 py-1 ${c.cell} border border-black/[0.04] hover:brightness-95 active:scale-[0.97] transition-all cursor-grab`}
                        >
                          <div className="flex items-center gap-1">
                            <span className={`w-1 h-1 rounded-full shrink-0 ${st.dot}`} />
                            <span className="text-[9px] font-bold text-gray-600 truncate">{p.owner_name}</span>
                          </div>
                          <p className="text-[9px] text-gray-500 truncate leading-tight">
                            {p.topic || "(미정)"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* 범례 */}
        {activeOwnerIds.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-gray-50 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {activeOwnerIds.map((id) => {
              const c = ownerColor(id);
              const m = memberById.get(id);
              const name = m ? m.display_name || m.username : plans.find((p) => p.owner_id === id)?.owner_name;
              return (
                <div key={id} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                  <span className="text-[10px] text-gray-500">{name}</span>
                </div>
              );
            })}
            <span className="text-[10px] text-gray-300 ml-auto">블록을 끌어 날짜를 옮길 수 있습니다</span>
          </div>
        )}
      </div>
    </div>
  );
}
