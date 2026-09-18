"use client";

import { useEffect, useState } from "react";
import { IconCalendarWeek, IconChevronDown } from "@tabler/icons-react";
import CampusMark from "../astro/CampusMark";
import { focusRing, todayLocal } from "./ui";
import { useWeekIssues, type WeekIssue } from "./useWeekIssues";

/**
 * 이번 주 이슈 — 런처 왼쪽 칸 (민열님 0919).
 *
 * 카드 숫자가 "지금 막힌 일"이라면 여기는 **"이번 주에 걸린 일"** 이다. 둘은 다르다 —
 * 막힌 건 이미 늦은 것이고, 이건 아직 안 늦은 것이다.
 *
 * 날짜별로 접어 보여 준다. 종류별로 묶으면 "수요일에 뭐 있더라"를 못 읽는다 —
 * 한 주를 보는 눈은 요일로 움직인다. 오늘 줄은 굵게, 지난 날은 흐리게.
 *
 * 폰에서는 **오늘부터 세 날**만 펴 두고 나머지는 접는다. 런처의 본래 일은 툴을 고르는
 * 것이라, 목록이 길어 카드가 화면 밖으로 밀리면 안 된다.
 */

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** 종류별 점 색 — 달력의 색과 같게 둔다. 두 화면에서 같은 일이 다른 색이면 눈이 다시 배워야 한다. */
const DOT: Record<string, string> = {
  meeting: "bg-navy", spot_meeting: "bg-fuchsia-500", spot_shoot: "bg-orange-500",
  due: "bg-amber-500", spot_due: "bg-yellow-600", spot_plan: "bg-purple-500", spot_done: "bg-lime-600",
  contract: "bg-emerald-500", contract_end: "bg-rose-500", signed: "bg-teal-500",
  payment: "bg-periwinkle", post: "bg-sky-500",
};

const KIND_LABEL: Record<string, string> = {
  meeting: "미팅", spot_meeting: "스팟 미팅", spot_shoot: "촬영", due: "기한", spot_due: "납품 기한",
  spot_plan: "기획안", spot_done: "납품", contract: "계약 시작", contract_end: "계약 종료",
  signed: "계약 체결", payment: "입금 예정", post: "게시물 업로드",
};

const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const dow = (d: string) => DOW[new Date(`${d}T00:00:00`).getDay()];

export default function WeekIssues({ onGo, onCount }: { onGo?: (target: string) => void; onCount?: (n: number) => void }) {
  const { from, to, items, campaigns, loading, failed } = useWeekIssues();
  // Satty 가 같은 숫자를 본다 — 두 번 읽지 않는다
  useEffect(() => { if (!loading) onCount?.(items.length); }, [loading, items.length, onCount]);
  const today = todayLocal();
  const [openAll, setOpenAll] = useState(false);

  // 날짜별로 묶는다. 아무것도 없는 날은 줄을 만들지 않는다 — 빈 줄 일곱 개는 정보가 아니다.
  const byDay = new Map<string, WeekIssue[]>();
  for (const it of items) {
    if (!byDay.has(it.date)) byDay.set(it.date, []);
    byDay.get(it.date)!.push(it);
  }
  const days = [...byDay.keys()].sort();
  // 지난 날은 뒤로 미루지 않는다(순서가 곧 한 주다). 다만 폰에서는 오늘 이후만 먼저 편다.
  const upcoming = days.filter((d) => d >= today);
  const shown = openAll ? days : days.slice(0, Math.max(3, upcoming.length ? days.indexOf(upcoming[0]) + 3 : 3));
  const hidden = days.length - shown.length;

  return (
    <section
      aria-label="이번 주 이슈"
      className="rounded-[20px] border border-white/70 bg-white/80 backdrop-blur shadow-[0_1px_2px_rgba(16,24,40,0.04),0_14px_30px_-26px_rgba(5,0,114,0.5)] p-4 lg:sticky lg:top-20"
    >
      <div className="flex items-baseline gap-2 mb-3">
        <IconCalendarWeek size={16} className="text-navy shrink-0 translate-y-0.5" aria-hidden="true" />
        <h2 className="text-[14px] font-bold text-gray-900 tracking-[-0.01em]">이번 주</h2>
        <span className="text-[11.5px] font-medium text-gray-400 tabular-nums">{md(from)}(월)~{md(to)}(일)</span>
        {!loading && <span className="ml-auto text-[11.5px] font-semibold text-gray-500 tabular-nums">{items.length}건</span>}
      </div>

      {/* 캠페인 주간은 하루가 아니라 주 전체에 걸린 일이라 목록이 아니라 띠로 보여 준다 */}
      {campaigns.map((c) => (
        <p key={`${c.kind}${c.start}`}
           className={`mb-2 rounded-xl px-2.5 py-1.5 text-[11.5px] font-semibold ${c.kind === "mileage_2x" ? "bg-amber-50 text-amber-800" : "bg-pink-50 text-pink-800"}`}>
          {c.label} · {md(c.start)}~{md(c.end)}
        </p>
      ))}

      {loading ? (
        <ul className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => <li key={i} className="h-9 rounded-lg bg-black/[0.04] animate-pulse" />)}
        </ul>
      ) : days.length === 0 ? (
        <p className="text-[12.5px] text-gray-500 leading-relaxed">
          {failed ? "매장·후보 목록을 읽지 못해 이번 주 일정을 셀 수 없습니다. 새로고침하면 다시 읽습니다." : "이번 주에 잡힌 일정이 없습니다. 후보의 미팅 일시, 매장의 계약 시작일, 콘텐츠 업로드 예정일을 적으면 여기에 모입니다."}
        </p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {shown.map((d) => {
              const list = byDay.get(d)!;
              const isToday = d === today;
              const past = d < today;
              return (
                <li key={d} className={past ? "opacity-55" : ""}>
                  <p className={`text-[11.5px] tabular-nums mb-1 ${isToday ? "font-bold text-navy" : "font-semibold text-gray-500"}`}>
                    {md(d)} ({dow(d)}){isToday && " · 오늘"}
                  </p>
                  <ul className="space-y-1">
                    {list.map((it, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          disabled={!it.go || !onGo}
                          onClick={() => it.go && onGo?.(it.go)}
                          className={`w-full text-left flex items-center gap-1.5 rounded-lg px-1.5 py-1 -mx-1.5 enabled:hover:bg-black/[0.035] disabled:cursor-default ${focusRing}`}
                        >
                          <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${DOT[it.kind] ?? "bg-gray-400"}`} aria-hidden="true" />
                          {it.at && <span className="shrink-0 text-[11px] font-semibold text-gray-500 tabular-nums w-[2.6rem]">{it.at}</span>}
                          <CampusMark campus={it.campus} size={13} />
                          <span className="min-w-0 flex-1 text-[12.5px] font-medium text-gray-900 truncate">{it.label}</span>
                          <span className="shrink-0 text-[10.5px] font-medium text-gray-400">{KIND_LABEL[it.kind] ?? ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>

          {hidden > 0 && (
            <button type="button" onClick={() => setOpenAll(true)}
              className={`mt-2.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-navy hover:underline rounded ${focusRing}`}>
              <IconChevronDown size={13} aria-hidden="true" />{hidden}일 더 보기
            </button>
          )}
        </>
      )}

      {onGo && (
        <button type="button" onClick={() => onGo("astro-calendar")}
          className={`mt-3 w-full rounded-xl border border-navy/15 bg-navy/[0.04] py-1.5 text-[11.5px] font-semibold text-navy hover:bg-navy/[0.08] transition-colors ${focusRing}`}>
          달력에서 전체 보기
        </button>
      )}
    </section>
  );
}
