"use client";

import { useState } from "react";

const PERIODS = ["이번 달", "지난 달", "3개월"] as const;
type Period = (typeof PERIODS)[number];

// 더미 차트 — 간단한 SVG 막대 그래프
function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map(({ label, value }) => (
        <div key={label} className="flex flex-col items-center flex-1 gap-1">
          <span className="text-[10px] text-gray-400">{value}</span>
          <div
            className="w-full rounded-t-md bg-periwinkle"
            style={{ height: `${(value / max) * 100}%`, minHeight: 4 }}
          />
          <span className="text-[9px] text-gray-400 truncate w-full text-center">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

// 도넛 차트 (단순 SVG)
function DonutChart({ pct }: { pct: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx="44" cy="44" r={r} stroke="#F0F0F8" strokeWidth="10" fill="none" />
      <circle
        cx="44"
        cy="44"
        r={r}
        stroke="#6366E0"
        strokeWidth="10"
        fill="none"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round"
      />
      <text x="44" y="49" textAnchor="middle" fontSize="14" fontWeight="700" fill="#0A0676">
        {pct}%
      </text>
    </svg>
  );
}

const DUMMY: Record<Period, { weekly: { label: string; value: number }[]; revisit: number; newUsers: number }> = {
  "이번 달": {
    weekly: [
      { label: "1주", value: 18 },
      { label: "2주", value: 27 },
      { label: "3주", value: 21 },
      { label: "4주", value: 32 },
    ],
    revisit: 42,
    newUsers: 31,
  },
  "지난 달": {
    weekly: [
      { label: "1주", value: 12 },
      { label: "2주", value: 20 },
      { label: "3주", value: 25 },
      { label: "4주", value: 18 },
    ],
    revisit: 37,
    newUsers: 24,
  },
  "3개월": {
    weekly: [
      { label: "4월", value: 55 },
      { label: "5월", value: 75 },
      { label: "6월", value: 98 },
    ],
    revisit: 40,
    newUsers: 89,
  },
};

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("이번 달");
  const data = DUMMY[period];

  return (
    <div className="px-4 pt-4 max-w-lg mx-auto pb-8">
      <h1 className="text-lg font-bold text-navy mb-4">분석</h1>

      {/* 기간 탭 */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-5 gap-1">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              period === p ? "bg-white text-navy shadow-sm" : "text-gray-400"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* 처리량 추이 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <p className="text-xs text-gray-400 mb-3">방문 처리량 추이</p>
        <BarChart data={data.weekly} />
      </div>

      {/* 재방문율 + 신규 유입 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col items-center gap-2">
          <p className="text-xs text-gray-400 self-start">재방문율</p>
          <DonutChart pct={data.revisit} />
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">신규 유입</p>
          <p className="text-3xl font-bold text-navy mt-2">
            {data.newUsers}
            <span className="text-sm font-normal text-gray-400 ml-1">명</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">전월 대비 ↑12%</p>
        </div>
      </div>

      {/* 매출 기여 — BOOST 잠금 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4 relative overflow-hidden">
        <p className="text-xs text-gray-400 mb-2">매출 기여 분석</p>
        <div className="blur-sm select-none pointer-events-none">
          <div className="h-24 bg-gray-100 rounded-xl" />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <span className="text-2xl">🔒</span>
          <p className="text-xs font-semibold text-gray-600">BOOST 이상</p>
          <a
            href="/dashboard/owner/plan"
            className="text-xs text-periwinkle font-semibold underline underline-offset-2"
          >
            업그레이드
          </a>
        </div>
      </div>

      {/* 시간대 패턴 — BOOST 잠금 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm relative overflow-hidden">
        <p className="text-xs text-gray-400 mb-2">시간대별 방문 패턴</p>
        <div className="blur-sm select-none pointer-events-none">
          <div className="grid grid-cols-6 gap-1">
            {Array.from({ length: 18 }).map((_, i) => (
              <div
                key={i}
                className="h-8 rounded bg-periwinkle/30"
                style={{ opacity: Math.random() * 0.8 + 0.2 }}
              />
            ))}
          </div>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <span className="text-2xl">🔒</span>
          <p className="text-xs font-semibold text-gray-600">BOOST 이상</p>
        </div>
      </div>
    </div>
  );
}
