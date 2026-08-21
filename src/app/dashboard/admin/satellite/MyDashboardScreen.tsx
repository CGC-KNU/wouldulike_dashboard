"use client";

import { useCallback, useEffect, useState } from "react";

import PlanEditor from "./PlanEditor";
import {
  MEDIA_META,
  MyDashboardResponse,
  MyWeek,
  fmtMD,
} from "./types";

const METRIC_ROWS: { key: string; label: string }[] = [
  { key: "views", label: "조회" },
  { key: "engagement", label: "참여" },
  { key: "saved", label: "저장" },
  { key: "shares", label: "공유" },
  { key: "comments", label: "댓글" },
  { key: "likes", label: "좋아요" },
  { key: "reach", label: "도달" },
];

function fmtNum(v: number | null | undefined) {
  return v == null ? "—" : Math.round(v).toLocaleString();
}

/**
 * 내 대시보드 (목업 §s-mine) — 본인 게시물 성과를 월/포맷 단위로 모아보고, 월간 회고를 남긴다.
 * §05-4 블라인드 원칙 그대로 — /my-dashboard 는 본인(또는 리드가 조회할 때만 타인) 것만
 * 응답에 담긴다. 월간 회고는 그보다 더 좁혀서 본인 조회일 때만 노출·저장된다(서버가 강제).
 *
 * 게시물 단위 성과·AI 분석·건별 메모는 PlanEditor(콘텐츠 피드백/에디터/게시물 상세 3탭)
 * 에서 계속 볼 수 있다 — 여기서는 "이 달 전체를 한눈에" 보는 요약 + 월간 회고에
 * 집중하고, 게시물을 클릭하면 그 3탭 화면을 같은 화면 위에 모달로 바로 띄운다 (RD 요청 —
 * 2026-08-20, 페이지 이동 없이 내 대시보드에서 바로 열리게).
 */
export default function MyDashboardScreen() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [mediaType, setMediaType] = useState("");
  const [data, setData] = useState<MyDashboardResponse | null>(null);
  const [myWeek, setMyWeek] = useState<MyWeek | null>(null);
  const [loading, setLoading] = useState(true);

  const [good, setGood] = useState("");
  const [improve, setImprove] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [openPlanId, setOpenPlanId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ year: String(year), month: String(month) });
      if (mediaType) qs.set("media_type", mediaType);
      const [dashRes, myWeekRes] = await Promise.all([
        fetch(`/api/satellite/my-dashboard?${qs.toString()}`),
        fetch("/api/satellite/my-week"),
      ]);
      if (dashRes.ok) {
        const d: MyDashboardResponse = await dashRes.json();
        setData(d);
        if (!mediaType && d.media_type) setMediaType(d.media_type);
        setGood(d.retro?.good_note ?? "");
        setImprove(d.retro?.improve_note ?? "");
      }
      if (myWeekRes.ok) setMyWeek(await myWeekRes.json());
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, mediaType]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveRetro() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/satellite/my-dashboard/retro", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, good_note: good, improve_note: improve }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    } finally {
      setSaving(false);
    }
  }

  function openPost(planId: number | null) {
    if (!planId) return;
    setOpenPlanId(planId);
  }

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
        <p className="text-xs text-gray-300">불러오는 중...</p>
      </div>
    );
  }
  if (!data) return null;

  const retroDirty = good !== (data.retro?.good_note ?? "") || improve !== (data.retro?.improve_note ?? "");

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

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-gray-800">
          내 성과 · {data.year}년 {data.month}월 · {data.post_count}건
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={`${year}-${month}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              setYear(y);
              setMonth(m);
            }}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white"
          >
            {data.months.map((ym) => (
              <option key={`${ym.year}-${ym.month}`} value={`${ym.year}-${ym.month}`}>
                {ym.year}년 {ym.month}월
              </option>
            ))}
          </select>
          <select
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white"
          >
            {(data.formats.length ? data.formats : [data.media_type]).map((f) => (
              <option key={f} value={f}>
                {MEDIA_META[f]?.label ?? f}
              </option>
            ))}
          </select>
        </div>
      </div>

      {data.post_count === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-10 text-center">
          <p className="text-xs text-gray-300">해당 월·포맷에 발행된 게시물이 없습니다.</p>
        </div>
      ) : (
        <>
          {data.low_sample && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
              <p className="text-[11px] text-amber-600 leading-relaxed">
                표본이 적습니다 ({data.post_count}건) — 이번 달 수치는 참고용입니다. 안정적인 비교는 아래 게시물별
                순위를 함께 보세요.
              </p>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-800">기준 대비 달성률</h3>
              <span className="text-[10px] text-gray-300">
                기준: 최근 {data.cohort_window_days ?? "—"}일 {MEDIA_META[data.media_type]?.label} {data.cohort_n}건
                · 절사 중앙값
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {METRIC_ROWS.map(({ key, label }) => {
                const m = data.metrics[key];
                if (!m || m.hidden || m.pi == null) {
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-10 text-[11px] text-gray-400 shrink-0">{label}</span>
                      <div className="flex-1 h-2.5 rounded-full bg-[repeating-linear-gradient(135deg,#e5e7eb,#e5e7eb_4px,#f3f4f6_4px,#f3f4f6_8px)]" />
                      <span className="w-16 text-right text-[10px] text-gray-300 shrink-0">연동 대기</span>
                    </div>
                  );
                }
                const pct = Math.max(4, Math.min(100, m.pi));
                const barCls = m.pi >= 100 ? "bg-periwinkle" : "bg-amber-400";
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-10 text-[11px] text-gray-500 shrink-0">{label}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full ${barCls}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-28 text-right text-[11px] font-semibold text-gray-700 shrink-0">
                      {m.pi}%
                      {m.percentile != null && (
                        <span className="text-gray-400 font-normal"> · 상위 {100 - m.percentile}%</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            {data.interpretation && (
              <div className="mt-3 pt-3 border-t border-gray-50">
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  <span className="font-bold text-gray-700">해석 — </span>
                  {data.interpretation}
                </p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-xs font-bold text-gray-800">내 게시물</h3>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-400 border-b border-gray-100">
                  <th className="text-left font-medium py-2 px-4">게시물</th>
                  <th className="text-right font-medium py-2">조회</th>
                  <th className="text-right font-medium py-2">참여</th>
                  <th className="text-right font-medium py-2">저장</th>
                  <th className="text-right font-medium py-2 px-4">PI</th>
                </tr>
              </thead>
              <tbody>
                {data.posts.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => openPost(p.plan_id)}
                    className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50"
                  >
                    <td className="py-2 px-4 min-w-0">
                      <p className="text-gray-700 font-medium truncate max-w-[220px]">{p.topic || "(주제 미정)"}</p>
                      <p className="text-[10px] text-gray-400">{p.posted_at.slice(0, 10)}</p>
                    </td>
                    <td className="text-right py-2 text-gray-600">{fmtNum(p.views)}</td>
                    <td className="text-right py-2 text-gray-600">{fmtNum(p.engagement)}</td>
                    <td className="text-right py-2 text-gray-600">{fmtNum(p.saved)}</td>
                    <td className="text-right py-2 px-4">
                      {p.collecting ? (
                        <span className="text-[10px] text-gray-300">집계 중</span>
                      ) : p.pi != null ? (
                        <span
                          className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                            p.pi >= 100 ? "text-green-600 bg-green-50" : "text-amber-600 bg-amber-50"
                          }`}
                        >
                          {p.pi}%
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data.is_self && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-xs font-bold text-gray-800">{data.month}월 회고</h3>
            <span className="text-[10px] text-gray-300">본인만 열람</span>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 mb-1">좋았던 점</p>
              <textarea
                value={good}
                onChange={(e) => setGood(e.target.value)}
                placeholder="이번 달 잘 됐던 것들을 적어두세요"
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 min-h-[64px] focus:outline-none focus:border-periwinkle"
              />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 mb-1">아쉬운 점</p>
              <textarea
                value={improve}
                onChange={(e) => setImprove(e.target.value)}
                placeholder="다음 달엔 바꿔볼 것들을 적어두세요"
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 min-h-[64px] focus:outline-none focus:border-periwinkle"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              {saved && <span className="text-[10px] text-green-600">저장됨</span>}
              <button
                onClick={saveRetro}
                disabled={saving || !retroDirty}
                className="text-[11px] font-semibold text-white bg-periwinkle rounded-lg px-3 py-1.5 disabled:opacity-40"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {openPlanId !== null && (
        <PlanEditor
          planId={openPlanId}
          initialTab="post"
          onClose={() => setOpenPlanId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
