"use client";

import { useState } from "react";

import {
  ContentPlan,
  DAY_KR,
  MEDIA_META,
  SPONSORSHIP_STATUS_META,
  SatelliteMember,
  STATUS_META,
  Sponsorship,
  ownerColor,
} from "./types";

type ViewMode = "month" | "week";

function fmtISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 협찬 배지 — ContentPlan 카드(담당자색 · 상태점)와 확실히 다르게, 항상 호박색 톤 하나로 통일. */
function SponsorBadge({ s, compact }: { s: Sponsorship; compact?: boolean }) {
  const st = SPONSORSHIP_STATUS_META[s.status];
  const hh = new Date(s.shoot_datetime).getHours();
  const mm = new Date(s.shoot_datetime).getMinutes();
  const time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  return (
    <div
      title={`협찬 촬영 · ${s.store_name} · ${time} · ${s.shoot_owner_name || "담당 미정"} · ${st.label}`}
      className={`w-full rounded-md px-1.5 ${compact ? "py-1" : "py-0.5"} border ${st.cls} flex items-center gap-1`}
    >
      <span className="text-[8px] shrink-0">📸</span>
      <span className={`truncate ${compact ? "text-[10px]" : "text-[9px]"} font-semibold`}>{s.store_name}</span>
    </div>
  );
}

/**
 * 월간 캘린더 — 주제표와 같은 데이터(ContentPlan)의 두 번째 얼굴.
 * 표는 입력·목록·중복 확인에 강하고, 캘린더는 분포 파악에 강하다. (설계서 §07-1)
 *
 * 협찬(Sponsorship)은 콘텐츠 칸반과 완전히 다른 개념(식당 촬영 일정 vs 콘텐츠 발행)
 * 이라 데이터·UI 모두 분리돼 있지만(§0-1 Phase 2), "등록하면 캘린더에는 둘 다
 * 표기돼야 한다"는 요구사항(2026-08-23)에 따라 이 캘린더 하나에서는 같이 보여준다 —
 * 다만 시각적으로 섞이지 않도록 ContentPlan 카드와는 다른(호박색) 배지로 구분한다.
 */
export default function PlanCalendar({
  year,
  month,
  today,
  plans,
  sponsorships,
  members,
  viewerAccountId,
  isLead,
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
  sponsorships: Sponsorship[];
  members: SatelliteMember[];
  viewerAccountId?: number | null;
  isLead?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelect: (plan: ContentPlan) => void;
  onDropOnDate: (planId: number, dateStr: string) => void;
}) {
  function actionLabel(p: ContentPlan): string {
    const isMine = !!viewerAccountId && (p.owner_id === viewerAccountId || p.shoot_owner_id === viewerAccountId);
    if (p.status === "published") return "성과 보기";
    if (isMine) return "작업하기";
    if (p.status === "draft" && !isLead) return "작업중";
    if (isLead) return "열람";
    return "피드백";
  }

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [weekAnchor, setWeekAnchor] = useState(today);

  /** 주간 뷰로 전환할 때, 현재 보고 있는 월(year/month)과 다른 주에 머물러 있으면 그 달로 스냅한다. */
  function switchToWeek() {
    const wd = new Date(weekAnchor + "T00:00:00");
    if (wd.getFullYear() !== year || wd.getMonth() + 1 !== month) {
      const td = new Date(today + "T00:00:00");
      const inThisMonth = td.getFullYear() === year && td.getMonth() + 1 === month;
      setWeekAnchor(inThisMonth ? today : `${year}-${String(month).padStart(2, "0")}-01`);
    }
    setViewMode("week");
  }

  /** 주 단위 이동 — 달을 넘어가면 부모의 월 이동(onPrev/onNext)도 함께 트리거한다. */
  function shiftWeek(deltaDays: number) {
    const cur = new Date(weekAnchor + "T00:00:00");
    cur.setDate(cur.getDate() + deltaDays);
    if (cur.getFullYear() !== year || cur.getMonth() + 1 !== month) {
      if (deltaDays > 0) onNext();
      else onPrev();
    }
    setWeekAnchor(fmtISO(cur));
  }

  function weekToToday() {
    onToday();
    setWeekAnchor(today);
  }

  const weekDays = (() => {
    const anchor = new Date(weekAnchor + "T00:00:00");
    const start = new Date(anchor);
    start.setDate(anchor.getDate() - anchor.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  })();
  const weekRangeLabel = `${weekDays[0].getMonth() + 1}/${weekDays[0].getDate()} – ${
    weekDays[6].getMonth() + 1
  }/${weekDays[6].getDate()}`;

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

  // shoot_datetime 은 시각 포함 ISO 문자열이라 로컬 날짜만 뽑아서 같은 방식(fmtISO)으로 버킷.
  const byDateSponsor = new Map<string, Sponsorship[]>();
  sponsorships.forEach((s) => {
    const ds = fmtISO(new Date(s.shoot_datetime));
    const arr = byDateSponsor.get(ds) ?? [];
    arr.push(s);
    byDateSponsor.set(ds, arr);
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-5 rounded-full bg-periwinkle" />
          <h3 className="text-sm font-bold text-gray-800">{viewMode === "month" ? monthLabel : `${monthLabel} · ${weekRangeLabel}`}</h3>
        </div>
        <div className="flex items-center gap-2.5">
          {/* 월간 · 주간 전환 */}
          <div className="flex items-center gap-0.5 bg-gray-50 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("month")}
              className={`text-[11px] font-semibold rounded-md px-2.5 py-1.5 min-h-[30px] transition-all ${
                viewMode === "month" ? "bg-white text-periwinkle shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              월간
            </button>
            <button
              onClick={switchToWeek}
              className={`text-[11px] font-semibold rounded-md px-2.5 py-1.5 min-h-[30px] transition-all ${
                viewMode === "week" ? "bg-white text-periwinkle shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              주간
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={viewMode === "month" ? onToday : weekToToday}
              className="text-[11px] font-semibold text-gray-400 hover:text-periwinkle px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors"
            >
              오늘
            </button>
            <button
              onClick={() => (viewMode === "month" ? onPrev() : shiftWeek(-7))}
              aria-label={viewMode === "month" ? "이전 달" : "이전 주"}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors active:scale-90"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M15 19L9 12l6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => (viewMode === "month" ? onNext() : shiftWeek(7))}
              aria-label={viewMode === "month" ? "다음 달" : "다음 주"}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors active:scale-90"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M9 19l6-7-6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 그리드 */}
      <div className="px-3 pt-2 pb-3">
        {viewMode === "week" && (
          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map((d, di) => {
              const ds = fmtISO(d);
              const inLoadedMonth = d.getFullYear() === year && d.getMonth() + 1 === month;
              const dayPlans = inLoadedMonth ? byDate.get(ds) ?? [] : [];
              const daySponsors = inLoadedMonth ? byDateSponsor.get(ds) ?? [] : [];
              const isToday = ds === today;
              return (
                <div
                  key={di}
                  onDragOver={(e) => inLoadedMonth && e.preventDefault()}
                  onDrop={(e) => {
                    if (!inLoadedMonth) return;
                    e.preventDefault();
                    const id = Number(e.dataTransfer.getData("text/plan-id"));
                    if (id) onDropOnDate(id, ds);
                  }}
                  className={`min-h-[220px] rounded-xl border p-2 flex flex-col gap-1.5 transition-colors ${
                    isToday
                      ? "border-periwinkle/40 bg-periwinkle/[0.04]"
                      : inLoadedMonth
                      ? "border-gray-100 hover:border-gray-200 hover:bg-gray-50/50"
                      : "border-gray-50 bg-gray-50/40"
                  }`}
                >
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-baseline gap-1">
                      <span
                        className={`text-xs font-bold leading-none ${
                          isToday ? "text-navy" : di === 0 ? "text-red-400" : di === 6 ? "text-blue-400" : "text-gray-500"
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      <span className="text-[9px] text-gray-300">{DAY_KR[di]}</span>
                    </div>
                    {isToday && <span className="w-1.5 h-1.5 rounded-full bg-periwinkle" />}
                  </div>

                  {!inLoadedMonth ? (
                    <p className="text-[9px] text-gray-300 text-center py-4">다른 달 · 그 달로 이동해 확인</p>
                  ) : dayPlans.length === 0 && daySponsors.length === 0 ? (
                    <p className="text-[9px] text-gray-200 text-center py-4">등록 없음</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {daySponsors.map((s) => (
                        <SponsorBadge key={`s-${s.id}`} s={s} compact />
                      ))}
                      {dayPlans.map((p) => {
                        const c = ownerColor(p.owner_id);
                        const st = STATUS_META[p.status];
                        return (
                          <button
                            key={p.id}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("text/plan-id", String(p.id))}
                            onClick={() => onSelect(p)}
                            title={`${p.owner_name} · ${p.topic || "(미정)"} · ${st.label} · ${actionLabel(p)}`}
                            className={`group w-full text-left rounded-lg px-2 py-1.5 ${c.cell} border border-black/[0.04] hover:brightness-95 hover:ring-1 hover:ring-periwinkle/40 active:scale-[0.97] transition-all cursor-grab`}
                          >
                            <div className="flex items-center gap-1">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                              <span className="text-[10px] font-bold text-gray-600 truncate flex-1">{p.owner_name}</span>
                            </div>
                            <p className="text-[10px] text-gray-500 truncate leading-tight mt-0.5">
                              {p.topic || "(미정)"}
                            </p>
                            <span className={`inline-block mt-1 text-[9px] font-semibold rounded-full px-1.5 py-0.5 border ${st.cls}`}>
                              {st.label}
                            </span>
                            <span className="hidden group-hover:block text-[9px] font-bold text-periwinkle mt-1">
                              {actionLabel(p)} →
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {viewMode === "month" && (
          <>
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
                const daySponsors = byDateSponsor.get(ds) ?? [];
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

                    {daySponsors.map((s) => (
                      <SponsorBadge key={`s-${s.id}`} s={s} />
                    ))}
                    {dayPlans.map((p) => {
                      const c = ownerColor(p.owner_id);
                      const st = STATUS_META[p.status];
                      return (
                        <button
                          key={p.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plan-id", String(p.id))}
                          onClick={() => onSelect(p)}
                          title={`${p.owner_name} · ${p.topic || "(미정)"} · ${st.label} · ${MEDIA_META[p.media_type].label} · ${actionLabel(p)}`}
                          className={`group w-full text-left rounded-lg px-1.5 py-1 ${c.cell} border border-black/[0.04] hover:brightness-95 hover:ring-1 hover:ring-periwinkle/40 active:scale-[0.97] transition-all cursor-grab`}
                        >
                          <div className="flex items-center gap-1">
                            <span className={`w-1 h-1 rounded-full shrink-0 ${st.dot}`} />
                            <span className="text-[9px] font-bold text-gray-600 truncate flex-1">{p.owner_name}</span>
                            <span className="hidden group-hover:inline text-[8px] font-bold text-periwinkle shrink-0">
                              {actionLabel(p)} →
                            </span>
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
          </>
        )}

        {/* 범례 */}
        {activeOwnerIds.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-gray-50 flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
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
              <span className="text-[10px] text-gray-300 ml-auto">
                📸 는 협찬 촬영 일정입니다(콘텐츠와 별개) · 블록을 끌어 날짜를 옮길 수 있습니다 · 클릭하면 바로 작업 화면으로 이동합니다
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {(
                [
                  ["draft", "주제만"],
                  ["ready", "준비완료"],
                  ["scheduled", "발행예약"],
                  ["published", "발행됨"],
                  ["failed", "발행실패/잠김"],
                ] as [keyof typeof STATUS_META, string][]
              ).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[key].dot}`} />
                  <span className="text-[9px] text-gray-400">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
