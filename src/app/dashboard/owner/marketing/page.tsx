"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function MarketingPage() {
  const searchParams = useSearchParams();
  const rid = searchParams.get("rid");
  const ridParam = rid ? `?rid=${rid}` : "";

  return (
    <div className="px-4 pt-4 max-w-lg mx-auto pb-8">
      <h1 className="text-lg font-bold text-navy mb-4">마케팅</h1>

      {/* 알림 예약 — 찜 사용자 대상 */}
      <Link
        href={`/dashboard/owner/notifications${ridParam}`}
        className="flex items-center gap-3 w-full px-4 py-4 bg-white rounded-2xl shadow-sm mb-4 hover:bg-periwinkle/5 transition-colors"
      >
        <span className="text-2xl">🔔</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">알림 예약</p>
          <p className="text-xs text-gray-400 mt-0.5">
            찜한 사용자에게 정오·저녁 시간대 알림 발송 예약
          </p>
        </div>
        <span className="text-gray-300 text-sm">›</span>
      </Link>

      {/* QR / 포스터 홍보 키트 — FREE */}
      <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">홍보 키트</h2>
          <p className="text-xs text-gray-400 mt-0.5">QR코드 · 포스터 · 테이블텐트</p>
        </div>
        <div className="p-4 flex flex-col gap-3">
          {[
            { label: "QR코드 다운로드", desc: "카카오 채널 스탬프 연결 QR", icon: "📲" },
            { label: "포스터 다운로드", desc: "A4 인쇄용 PNG (우주라이크 브랜딩)", icon: "🖨" },
            { label: "테이블텐트 다운로드", desc: "양면 접이식 PDF", icon: "📋" },
          ].map(({ label, desc, icon }) => (
            <button
              key={label}
              className="flex items-center gap-3 w-full px-4 py-3 bg-gray-50 rounded-xl hover:bg-periwinkle/10 transition-colors text-left"
            >
              <span className="text-xl">{icon}</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{label}</p>
                <p className="text-xs text-gray-400">{desc}</p>
              </div>
              <span className="ml-auto text-gray-300">→</span>
            </button>
          ))}
        </div>
      </div>

      {/* 인스타 매거진 — CONTENT 잠금 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden relative">
        <div className="px-4 py-3 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">인스타 매거진</h2>
            <span className="text-xs bg-indigo-100 text-indigo-600 font-bold px-2 py-0.5 rounded-full">
              CONTENT
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            매월 인스타그램 카드뉴스 자동 제작 · 발행
          </p>
        </div>

        {/* 미리보기 (블러) */}
        <div className="blur-sm select-none pointer-events-none p-4">
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square bg-gradient-to-br from-indigo-100 to-periwinkle/20 rounded-xl" />
            ))}
          </div>
        </div>

        {/* 잠금 오버레이 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 backdrop-blur-[2px]">
          <span className="text-3xl">🔒</span>
          <p className="text-sm font-semibold text-gray-700">CONTENT 플랜 전용</p>
          <p className="text-xs text-gray-400">월 ₩80,000</p>
          <a
            href="/dashboard/owner/plan"
            className="mt-2 px-4 py-1.5 bg-indigo-500 text-white text-xs font-semibold rounded-full hover:bg-indigo-600 transition-colors"
          >
            플랜 업그레이드
          </a>
        </div>
      </div>
    </div>
  );
}
