"use client";

import { useCallback, useEffect, useState } from "react";

import PlanCalendar from "./PlanCalendar";
import PlanTable from "./PlanTable";
import { ContentPlan, MyWeek, PlansResponse, SatelliteMember, fmtMD } from "./types";

/**
 * 세틀라이트 — 우주라이크 인스타그램 제작 콘솔 (1차: 캘린더 / 주제표)
 *
 * 표와 캘린더가 같은 ContentPlan 데이터를 공유한다. 표에서 날짜를 바꾸면
 * 캘린더 블록이 이동하고, 캘린더에서 블록을 끌어도 표의 날짜가 바뀐다.
 */
export default function SatelliteTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [data, setData] = useState<PlansResponse | null>(null);
  const [members, setMembers] = useState<SatelliteMember[]>([]);
  const [myWeek, setMyWeek] = useState<MyWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/satellite/plans?year=${year}&month=${month}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.detail ?? "콘텐츠를 불러오지 못했습니다.");
        setData(null);
      } else {
        setData(await res.json());
      }
    } catch {
      setErr("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const loadMyWeek = useCallback(async () => {
    try {
      const res = await fetch("/api/satellite/my-week");
      if (res.ok) setMyWeek(await res.json());
    } catch {
      /* 배너는 부가 정보 */
    }
  }, []);

  useEffect(() => {
    fetch("/api/satellite/members")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setMembers(Array.isArray(d) ? d : []))
      .catch(() => setMembers([]));
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    loadMyWeek();
  }, [loadMyWeek]);

  /* ─── 변경 핸들러 ───────────────────────────────── */

  async function patch(id: number, body: Record<string, unknown>): Promise<boolean> {
    setBusyId(id);
    try {
      const res = await fetch(`/api/satellite/plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.detail ?? "수정에 실패했습니다.");
        return false;
      }
      // 응답으로 해당 행만 갱신 — 전체 리로드보다 깜빡임이 적다
      setData((prev) =>
        prev ? { ...prev, plans: prev.plans.map((p) => (p.id === id ? { ...p, ...d } : p)) } : prev
      );
      loadMyWeek();
      return true;
    } catch {
      alert("네트워크 오류");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function create(body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch("/api/satellite/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.detail ?? "등록에 실패했습니다.");
        return false;
      }
      await loadPlans();
      loadMyWeek();
      return true;
    } catch {
      alert("네트워크 오류");
      return false;
    }
  }

  async function remove(id: number) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/satellite/plans/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setData((prev) => (prev ? { ...prev, plans: prev.plans.filter((p) => p.id !== id) } : prev));
        loadMyWeek();
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.detail ?? "삭제에 실패했습니다.");
      }
    } finally {
      setBusyId(null);
    }
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  function goToday() {
    const d = new Date();
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  /* 캘린더에서 드래그로 날짜 이동 — 표와 같은 PATCH 를 탄다 */
  async function moveToDate(planId: number, dateStr: string) {
    const plan = data?.plans.find((p) => p.id === planId);
    if (!plan || plan.scheduled_date === dateStr) return;
    await patch(planId, { scheduled_date: dateStr });
  }

  const viewerAccountId = data?.viewer.account_id ?? null;
  const isLead = data?.viewer.is_lead ?? false;
  const today = data?.today ?? new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      {/* 이번 주 내 몫 배너 — 근태의 1차 방어선 */}
      {myWeek?.has_account && (
        <div
          className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 ${
            myWeek.satisfied
              ? "border-green-200 bg-gradient-to-r from-green-50 to-emerald-50"
              : "border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                myWeek.satisfied ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"
              }`}
            >
              {myWeek.satisfied ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <div className="min-w-0">
              <p className={`text-xs font-bold ${myWeek.satisfied ? "text-green-700" : "text-amber-700"}`}>
                {myWeek.satisfied ? "이번 주 몫 등록 완료" : "이번 주 주제를 아직 다 등록하지 않았습니다"}
              </p>
              <p className={`text-[11px] mt-0.5 ${myWeek.satisfied ? "text-green-600" : "text-amber-600"}`}>
                {fmtMD(myWeek.week_start)}~{fmtMD(myWeek.week_end)} · 주제 {myWeek.with_topic}/{myWeek.quota}건
                {(myWeek.ready ?? 0) > 0 && ` · 준비완료 ${myWeek.ready}건`}
              </p>
            </div>
          </div>
        </div>
      )}

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-xs text-red-600">{err}</p>
        </div>
      )}

      {loading && !data ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
          <p className="text-xs text-gray-300">불러오는 중...</p>
        </div>
      ) : (
        data && (
          <>
            <PlanTable
              plans={data.plans}
              members={members}
              viewerAccountId={viewerAccountId}
              isLead={isLead}
              today={today}
              onPatch={patch}
              onDelete={remove}
              onCreate={create}
              busyId={busyId}
            />

            <PlanCalendar
              year={year}
              month={month}
              today={today}
              plans={data.plans}
              members={members}
              onPrev={() => shiftMonth(-1)}
              onNext={() => shiftMonth(1)}
              onToday={goToday}
              onSelect={() => {
                /* 2차: 에디터 / 콘텐츠 상세로 라우팅 (설계서 §07-2) */
              }}
              onDropOnDate={moveToDate}
            />
          </>
        )
      )}

      <p className="text-[10px] text-gray-300 text-center px-4 leading-relaxed">
        1차 범위는 주제 캘린더까지입니다. 에디터·자동 발행·성과 대시보드는 다음 단계에서 붙습니다.
      </p>
    </div>
  );
}
