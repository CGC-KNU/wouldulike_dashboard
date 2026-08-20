"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ContentPlan,
  MyWeek,
  PERFORMANCE_METRIC_LABEL,
  PlansResponse,
  PostPerformance,
  STATUS_META,
  fmtMD,
} from "./types";

/**
 * 내 대시보드 (목업 §s-mine) — 본인 지표 · 게시글 · 회고록.
 * 회고록 잠금 규칙은 아직 미정이라(§7 Q3) 우선 자유 편집으로 열어뒀다 — 백엔드
 * ContentPlan.retro_text 참고.
 */
export default function MyDashboardScreen() {
  const now = new Date();
  const [data, setData] = useState<PlansResponse | null>(null);
  const [myWeek, setMyWeek] = useState<MyWeek | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, myWeekRes] = await Promise.all([
        fetch(`/api/satellite/plans?year=${now.getFullYear()}&month=${now.getMonth() + 1}`),
        fetch("/api/satellite/my-week"),
      ]);
      if (plansRes.ok) setData(await plansRes.json());
      if (myWeekRes.ok) setMyWeek(await myWeekRes.json());
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
        <p className="text-xs text-gray-300">불러오는 중...</p>
      </div>
    );
  }

  const viewerId = data?.viewer.account_id ?? null;
  const mine = (data?.plans ?? []).filter((p) => p.owner_id === viewerId);
  const published = mine.filter((p) => p.status === "published").length;

  return (
    <div className="flex flex-col gap-4">
      {myWeek?.has_account && (
        <div
          className={`rounded-2xl border px-4 py-3 ${
            myWeek.satisfied ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
          }`}
        >
          <p className={`text-xs font-bold ${myWeek.satisfied ? "text-green-700" : "text-amber-700"}`}>
            이번 주 {myWeek.with_topic}/{myWeek.quota}건
            {(myWeek.ready ?? 0) > 0 && ` · 준비완료 ${myWeek.ready}건`}
          </p>
          <p className={`text-[11px] mt-0.5 ${myWeek.satisfied ? "text-green-600" : "text-amber-600"}`}>
            {fmtMD(myWeek.week_start)}~{fmtMD(myWeek.week_end)}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-[10px] text-gray-400 font-semibold">이번 달 등록</p>
          <p className="text-lg font-bold text-gray-800 mt-0.5">{mine.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-[10px] text-gray-400 font-semibold">이번 달 발행</p>
          <p className="text-lg font-bold text-green-600 mt-0.5">{published}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {mine.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-10 text-center">
            <p className="text-xs text-gray-300">이번 달 등록한 콘텐츠가 없습니다.</p>
          </div>
        )}
        {mine.map((p) => (
          <MyPlanCard key={p.id} plan={p} />
        ))}
      </div>
    </div>
  );
}

function MyPlanCard({ plan }: { plan: ContentPlan }) {
  const [retro, setRetro] = useState(plan.retro_text);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [perf, setPerf] = useState<PostPerformance | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfLoaded, setPerfLoaded] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  async function loadPerformance() {
    if (perfLoaded || perfLoading) return;
    setPerfLoading(true);
    try {
      const res = await fetch(`/api/satellite/plans/${plan.id}/performance`);
      if (res.ok) setPerf(await res.json());
      setPerfLoaded(true);
    } finally {
      setPerfLoading(false);
    }
  }

  async function runAnalysis() {
    setAnalysisLoading(true);
    setAnalysisError("");
    try {
      const res = await fetch(`/api/satellite/plans/${plan.id}/ai-analysis`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAnalysis(data.analysis || "");
      } else {
        setAnalysisError(data.detail || "AI 분석에 실패했습니다.");
      }
    } catch {
      setAnalysisError("AI 분석 요청에 실패했습니다.");
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function saveRetro() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/satellite/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retro_text: retro }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">{plan.topic || "(주제 미정)"}</p>
          <p className="text-[10px] text-gray-400">{plan.scheduled_date}</p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_META[plan.status].cls}`}>
          {STATUS_META[plan.status].label}
        </span>
      </div>

      {plan.status === "published" && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-gray-400">성과</p>
            {!perfLoaded && (
              <button
                onClick={loadPerformance}
                disabled={perfLoading}
                className="text-[10px] font-semibold text-periwinkle disabled:opacity-40"
              >
                {perfLoading ? "불러오는 중..." : "성과 보기"}
              </button>
            )}
          </div>

          {perf && !perf.available && (
            <p className="text-[10px] text-gray-400 mt-1">{perf.reason}</p>
          )}

          {perf?.available && (
            <div className="mt-1.5">
              <p className="text-[10px] text-gray-400 mb-1.5">
                발행 {perf.age_days}일 경과 · 기준: {perf.basis === "D7" ? "D7" : "누적"}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {perf.metrics &&
                  ["views", "engagement"].map((key) => {
                    const m = perf.metrics?.[key];
                    if (!m) return null;
                    return (
                      <div key={key} className="bg-gray-50 rounded-lg px-2 py-1.5">
                        <p className="text-[9px] text-gray-400 font-semibold">
                          {PERFORMANCE_METRIC_LABEL[key] ?? key}
                        </p>
                        <p className="text-xs font-bold text-gray-800">{m.value.toLocaleString()}</p>
                        {m.cohort.hidden ? (
                          <p className="text-[9px] text-gray-300">비교 표본 부족</p>
                        ) : (
                          <p className="text-[9px] text-gray-400">
                            기준 대비 {m.pi}% · 상위 {m.percentile != null ? 100 - m.percentile : "-"}%
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>

              <div className="mt-2">
                {!analysis && (
                  <button
                    onClick={runAnalysis}
                    disabled={analysisLoading}
                    className="text-[10px] font-semibold text-white bg-periwinkle rounded-lg px-2.5 py-1 disabled:opacity-40"
                  >
                    {analysisLoading ? "분석 중..." : "AI 분석"}
                  </button>
                )}
                {analysisError && <p className="text-[10px] text-red-500 mt-1">{analysisError}</p>}
                {analysis && (
                  <p className="text-[11px] text-gray-600 bg-periwinkle/5 rounded-lg px-2.5 py-2 mt-1 leading-relaxed">
                    {analysis}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {plan.status === "published" && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-50">
          <p className="text-[10px] font-semibold text-gray-400 mb-1">회고</p>
          <textarea
            value={retro}
            onChange={(e) => setRetro(e.target.value)}
            placeholder="왜 잘 됐는지 / 안 됐는지, 다음에 바꿀 점을 적어두세요"
            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 min-h-[56px] focus:outline-none focus:border-periwinkle"
          />
          <div className="flex items-center justify-end gap-2 mt-1.5">
            {saved && <span className="text-[10px] text-green-600">저장됨</span>}
            <button
              onClick={saveRetro}
              disabled={saving || retro === plan.retro_text}
              className="text-[10px] font-semibold text-white bg-periwinkle rounded-lg px-2.5 py-1 disabled:opacity-40"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
