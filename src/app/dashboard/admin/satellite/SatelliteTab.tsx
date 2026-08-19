"use client";

import { useState } from "react";

import PapillonDashboard from "./PapillonDashboard";

type ProductKey = "papillon" | "astro" | "aether" | "probe";

interface ProductMeta {
  key: ProductKey;
  name: string;
  subtitle: string;
  description: string;
  ready: boolean;
}

const PRODUCTS: ProductMeta[] = [
  {
    key: "papillon",
    name: "Papillon",
    subtitle: "마케팅 툴",
    description: "협찬 캘린더 · 칸반보드 · 인스타 에디터 · 성과",
    ready: true,
  },
  {
    key: "astro",
    name: "Astro",
    subtitle: "영업 툴",
    description: "입금 현황 · 매장 콘텐츠 · 식당/쿠폰 관리",
    ready: false,
  },
  {
    key: "aether",
    name: "Aether",
    subtitle: "관리 및 운영",
    description: "앱 관리 · 프로모션 · 미션 · 마일리지 · A/B 테스트",
    ready: false,
  },
  {
    key: "probe",
    name: "Probe",
    subtitle: "지표 · 데이터 분석",
    description: "채널/캠페인 지표 대시보드",
    ready: false,
  },
];

/**
 * 세틀라이트 진입점 — Papillon(마케팅) / Astro(영업) / Aether(관리운영) / Probe(지표)
 * 선택 화면 (Papillon/Astro/Aether/Probe 개편 기획서 §5).
 *
 * Papillon 만 1차로 실제 대시보드가 붙어있고 나머지는 준비 중 안내만 띄운다.
 */
export default function SatelliteTab() {
  const [selected, setSelected] = useState<ProductKey | null>(null);

  if (selected === "papillon") {
    return (
      <div className="flex flex-col gap-3">
        <BackBar onBack={() => setSelected(null)} />
        <PapillonDashboard />
      </div>
    );
  }

  if (selected) {
    const meta = PRODUCTS.find((p) => p.key === selected)!;
    return (
      <div className="flex flex-col gap-3">
        <BackBar onBack={() => setSelected(null)} />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
          <p className="text-sm font-bold text-gray-700">{meta.name}</p>
          <p className="text-[11px] text-gray-400 mt-1">{meta.subtitle} — 준비 중입니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-bold text-gray-800">세틀라이트</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">사용할 도구를 선택하세요</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PRODUCTS.map((p) => (
          <button
            key={p.key}
            onClick={() => setSelected(p.key)}
            className="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-periwinkle/40 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-800">{p.name}</span>
              <span className="text-[10px] font-semibold text-periwinkle bg-periwinkle/10 rounded-full px-2 py-0.5">
                {p.subtitle}
              </span>
              {!p.ready && (
                <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                  준비 중
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">{p.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="self-start text-[11px] font-semibold text-gray-400 hover:text-gray-600 flex items-center gap-1"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      세틀라이트
    </button>
  );
}
