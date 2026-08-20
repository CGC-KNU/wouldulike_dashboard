"use client";

import { useEffect, useState } from "react";

import { PERFORMANCE_METRIC_LABEL, PlanStatus, PostPerformance } from "./types";

const SECONDARY_METRICS = ["reach", "saved", "shares", "likes", "comments", "follows"];

function fmtNum(v: number | null | undefined) {
  return v == null ? "—" : v.toLocaleString();
}

/**
 * 게시물 상세(§s-post) — 콘텐츠 상세(에디터)에서 재사용하는 성과 패널.
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
        <h3 className="text-sm font-bold text-gray-800">성과 · 게시물 상세</h3>
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
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="text-[10px] text-gray-400">
              발행 {perf.age_days}일 경과 · 기준: {perf.basis === "D7" ? "D7" : "누적"}
              {perf.collecting && " · 지표 수집 중"}
              {perf.post?.card_count != null && ` · 카드 ${perf.post.card_count}장`}
              {perf.post?.caption_length != null && ` · 캡션 ${perf.post.caption_length}자`}
            </p>
            {perf.post?.permalink && (
              <a
                href={perf.post.permalink}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold text-periwinkle shrink-0"
              >
                인스타그램에서 보기 ↗
              </a>
            )}
          </div>

          {/* 주력 지표(조회·참여) */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            {["views", "engagement"].map((key) => {
              const m = perf.metrics?.[key];
              if (!m) return null;
              return (
                <div key={key} className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <p className="text-[10px] text-gray-400 font-semibold">{PERFORMANCE_METRIC_LABEL[key]}</p>
                  <p className="text-lg font-bold text-gray-800 mt-0.5">{fmtNum(m.value)}</p>
                  {m.cohort.hidden ? (
                    <p className="text-[9px] text-gray-300 mt-0.5">비교 표본 부족</p>
                  ) : (
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      기준 대비{" "}
                      <span className={m.pi != null && m.pi >= 100 ? "text-green-600 font-semibold" : "text-amber-600 font-semibold"}>
                        {m.pi}%
                      </span>{" "}
                      · 상위 {m.percentile != null ? 100 - m.percentile : "-"}%
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* 세부 지표 */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {SECONDARY_METRICS.map((key) => {
              const m = perf.metrics?.[key];
              if (!m) return null;
              return (
                <div key={key} className="bg-gray-50 rounded-lg px-2.5 py-2">
                  <p className="text-[9px] text-gray-400 font-semibold">{PERFORMANCE_METRIC_LABEL[key] ?? key}</p>
                  <p className="text-xs font-bold text-gray-800">{fmtNum(m.value)}</p>
                  {!m.cohort.hidden && <p className="text-[9px] text-gray-400">기준 대비 {m.pi ?? "—"}%</p>}
                </div>
              );
            })}
          </div>

          {/* 퍼포먼스 특이점 */}
          {perf.insights && perf.insights.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-bold text-gray-500 mb-1.5">퍼포먼스 특이점</p>
              <div className="flex flex-col gap-1.5">
                {perf.insights.map((ins, i) => (
                  <div
                    key={i}
                    className={`rounded-xl px-3 py-2.5 ${
                      ins.tone === "good" ? "bg-green-50 border border-green-100" : "bg-amber-50 border border-amber-100"
                    }`}
                  >
                    <p className={`text-[11px] font-bold ${ins.tone === "good" ? "text-green-700" : "text-amber-700"}`}>
                      {ins.title}
                    </p>
                    <p className={`text-[11px] mt-0.5 leading-relaxed ${ins.tone === "good" ? "text-green-700" : "text-amber-700"}`}>
                      {ins.body}
                    </p>
                    <p className={`text-[10px] mt-1 ${ins.tone === "good" ? "text-green-600" : "text-amber-600"}`}>
                      → {ins.suggestion}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {perf.insight_disclaimer && (
            <p className="text-[10px] text-gray-300 leading-relaxed mb-3">{perf.insight_disclaimer}</p>
          )}

          {/* 코호트 내 위치 */}
          {perf.cohort_position_metrics && perf.cohort_position_metrics.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-bold text-gray-500 mb-1.5">코호트 내 위치</p>
              <div className="flex flex-col gap-1.5">
                {perf.cohort_position_metrics.map((key) => {
                  const m = perf.metrics?.[key];
                  if (!m || m.cohort.hidden || m.percentile == null) return null;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-9 text-[10px] text-gray-400 shrink-0">{PERFORMANCE_METRIC_LABEL[key]}</span>
                      <div className="flex-1 h-2 rounded-full bg-gray-100 relative overflow-hidden">
                        <div className="absolute top-0 bottom-0 w-px bg-gray-300" style={{ left: "50%" }} />
                        <div className="h-full rounded-full bg-periwinkle" style={{ width: `${Math.max(2, m.percentile)}%` }} />
                      </div>
                      <span className="w-14 text-right text-[10px] text-gray-500 shrink-0">상위 {100 - m.percentile}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 시간 경과 */}
          {perf.time_series && perf.time_series.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-bold text-gray-500 mb-1.5">시간 경과 · 조회</p>
              <div className="flex flex-col gap-1.5">
                {(() => {
                  const captured = perf.time_series.filter((t) => t.captured && t.value != null);
                  const max = Math.max(1, ...captured.map((t) => t.value as number));
                  return perf.time_series.map((t) => (
                    <div key={t.window} className="flex items-center gap-2">
                      <span className="w-10 text-[10px] text-gray-400 shrink-0">{t.label}</span>
                      {t.captured ? (
                        <>
                          <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${t.window === "current" ? "bg-gray-700" : "bg-periwinkle"}`}
                              style={{ width: `${Math.max(2, ((t.value ?? 0) / max) * 100)}%` }}
                            />
                          </div>
                          <span className="w-14 text-right text-[10px] text-gray-600 shrink-0">{fmtNum(t.value)}</span>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 h-2 rounded-full bg-[repeating-linear-gradient(135deg,#e5e7eb,#e5e7eb_4px,#f3f4f6_4px,#f3f4f6_8px)]" />
                          <span className="w-14 text-right text-[10px] text-gray-300 shrink-0">예정</span>
                        </>
                      )}
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-gray-50">
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
