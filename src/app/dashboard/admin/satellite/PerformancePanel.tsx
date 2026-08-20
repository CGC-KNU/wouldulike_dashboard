"use client";

import { useEffect, useState } from "react";

import { PERFORMANCE_METRIC_LABEL, PlanStatus, PostPerformance } from "./types";

/**
 * 성과 패널 — 콘텐츠 상세(에디터)에서 재사용하는 조회·도달·저장 지표 + AI 분석.
 * §05-4 블라인드 규칙: 본인 것만, 리드는 전원. 이 컴포넌트를 렌더링할지 말지는
 * 부모(PlanEditor)가 plan.is_owner || plan.is_lead 로 미리 걸러서 넘겨준다 —
 * 서버(PlanPerformanceView/PostAIAnalysisView)도 같은 규칙으로 이중 방어한다.
 *
 * 발행 전(scheduled 등)에는 아직 Post 가 없어 조회할 게 없으므로, 목업처럼
 * 스켈레톤 + 안내 문구만 보여주고 API 호출은 하지 않는다.
 */
export default function PerformancePanel({
  planId,
  status,
}: {
  planId: number;
  status: PlanStatus;
}) {
  const [perf, setPerf] = useState<PostPerformance | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  useEffect(() => {
    if (status !== "published") return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/satellite/plans/${planId}/performance`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (!cancelled) setPerf(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [planId, status]);

  async function runAnalysis() {
    setAnalysisLoading(true);
    setAnalysisError("");
    try {
      const res = await fetch(`/api/satellite/plans/${planId}/ai-analysis`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setAnalysis(data.analysis || "");
      else setAnalysisError(data.detail || "AI 분석에 실패했습니다.");
    } catch {
      setAnalysisError("AI 분석 요청에 실패했습니다.");
    } finally {
      setAnalysisLoading(false);
    }
  }

  const beforePublish = status !== "published";

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-sm font-bold text-gray-800">성과</h3>
        <span className="text-[10px] text-gray-300">본인 + 리드만 열람</span>
      </div>

      {beforePublish ? (
        <>
          <div className="rounded-xl bg-periwinkle/5 border border-periwinkle/15 px-3 py-2.5 mb-3">
            <p className="text-[11px] text-periwinkle leading-relaxed">
              아직 발행 전입니다. 발행 후 D+1부터 지표가 채워지고, D+7 시점 값이 비교 기준이 됩니다.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {["조회", "도달", "저장"].map((label) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">{label}</span>
                <div className="flex items-center gap-2">
                  <span
                    className="block w-28 h-2.5 rounded-full bg-[repeating-linear-gradient(135deg,#e5e7eb,#e5e7eb_4px,#f3f4f6_4px,#f3f4f6_8px)]"
                    aria-hidden
                  />
                  <span className="text-[10px] text-gray-300 w-12 text-right">집계 전</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : loading ? (
        <p className="text-[11px] text-gray-300 text-center py-4">불러오는 중...</p>
      ) : perf && !perf.available ? (
        <p className="text-[11px] text-gray-400 py-2">{perf.reason}</p>
      ) : perf?.available ? (
        <>
          <p className="text-[10px] text-gray-400 mb-2">
            발행 {perf.age_days}일 경과 · 기준: {perf.basis === "D7" ? "D7" : "누적"}
            {perf.collecting && " · 지표 수집 중"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {perf.metrics &&
              Object.entries(perf.metrics)
                .slice(0, 4)
                .map(([key, m]) => (
                  <div key={key} className="bg-gray-50 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-gray-400 font-semibold">
                      {PERFORMANCE_METRIC_LABEL[key] ?? key}
                    </p>
                    <p className="text-sm font-bold text-gray-800 mt-0.5">{m.value.toLocaleString()}</p>
                    {m.cohort.hidden ? (
                      <p className="text-[9px] text-gray-300 mt-0.5">비교 표본 부족</p>
                    ) : (
                      <p className="text-[9px] text-gray-400 mt-0.5">
                        기준 대비 {m.pi}% · 상위 {m.percentile != null ? 100 - m.percentile : "-"}%
                      </p>
                    )}
                  </div>
                ))}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-50">
            {!analysis && (
              <button
                onClick={runAnalysis}
                disabled={analysisLoading}
                className="text-[11px] font-semibold text-white bg-periwinkle rounded-lg px-3 py-1.5 disabled:opacity-40"
              >
                {analysisLoading ? "분석 중..." : "AI 분석"}
              </button>
            )}
            {analysisError && <p className="text-[11px] text-red-500 mt-1.5">{analysisError}</p>}
            {analysis && (
              <p className="text-xs text-gray-600 bg-periwinkle/5 rounded-xl px-3 py-2.5 leading-relaxed whitespace-pre-wrap">
                {analysis}
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="text-[11px] text-gray-300 py-2">불러오지 못했습니다.</p>
      )}
    </section>
  );
}
