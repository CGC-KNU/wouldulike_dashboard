"use client";

import { useCallback, useEffect, useState } from "react";

import PlanEditor from "./PlanEditor";
import {
  ContentPlan,
  MEDIA_META,
  STATUS_META,
  fmtMD,
  dowKR,
  ownerColor,
} from "./types";

/**
 * 목업(세틀라이트_목업.html) 사이드바의 "콘텐츠 피드백"·"에디터"·"게시물 상세" — 정적
 * 목업은 화면마다 특정 게시물이 미리 정해져 있지만, 실제 앱에서는 항상 특정 건을 열어야
 * 한다. RD 결정(2026-08-20, AskUserQuestion) — 이 세 메뉴는 "목록 화면으로 이동"한다.
 * 목록에서 행을 클릭하면 그 건의 PlanEditor 가 지정된 탭으로 열린다.
 *
 * 세 메뉴 모두 이 컴포넌트 하나를 status/initialTab 만 바꿔 재사용한다 — 콘텐츠 피드백과
 * 에디터는 같은 "진행 중" 목록을 다른 탭으로 열 뿐이고, 게시물 상세는 발행완료 목록이다.
 * ("콘텐츠 상세" → "콘텐츠 피드백" 명칭 변경 — 마케팅팀 피드백 2026-08-20, §8)
 */
export default function PlanQuickList({
  status,
  initialTab,
  title,
  subtitle,
  emptyLabel,
}: {
  status: "active" | "published";
  initialTab: "detail" | "content" | "post";
  title: string;
  subtitle: string;
  emptyLabel: string;
}) {
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [openPlanId, setOpenPlanId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/satellite/plans/quick-list?status=${status}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setPlans(d.plans ?? []);
        setTruncated(!!d.truncated);
      } else {
        setErr(d.detail || "불러오지 못했습니다.");
      }
    } catch {
      setErr("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <h2 className="text-sm font-bold text-gray-800">{title}</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>
        </div>

        {loading && <p className="text-[11px] text-gray-300 text-center py-8">불러오는 중...</p>}
        {!loading && err && <p className="text-[11px] text-red-500 text-center py-8">{err}</p>}
        {!loading && !err && plans.length === 0 && (
          <p className="text-[11px] text-gray-300 text-center py-8">{emptyLabel}</p>
        )}

        {!loading && !err && plans.length > 0 && (
          <div className="divide-y divide-gray-50">
            {plans.map((p) => {
              const c = ownerColor(p.owner_id);
              const st = STATUS_META[p.status];
              return (
                <button
                  key={p.id}
                  onClick={() => setOpenPlanId(p.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-[11px] text-gray-400 w-14 shrink-0">
                    {fmtMD(p.scheduled_date)} ({dowKR(p.scheduled_date)})
                  </span>
                  <span className={`text-[10px] font-bold rounded-full px-2 py-1 shrink-0 ${c.chip}`}>
                    {p.owner_name}
                  </span>
                  <span className="flex-1 min-w-0 text-xs text-gray-700 truncate">
                    {p.topic || "(주제 미정)"}
                  </span>
                  <span className="text-[10px] text-gray-400 shrink-0">{MEDIA_META[p.media_type].label}</span>
                  <span className={`text-[10px] font-semibold rounded-full px-2 py-1 border shrink-0 ${st.cls}`}>
                    {st.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {truncated && (
          <p className="text-[10px] text-gray-300 text-center py-2 border-t border-gray-50">
            최근 항목만 표시됩니다 — 전체 이력은 캘린더에서 월별로 확인해주세요.
          </p>
        )}
      </div>

      {openPlanId !== null && (
        <PlanEditor
          planId={openPlanId}
          initialTab={initialTab}
          onClose={() => setOpenPlanId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
