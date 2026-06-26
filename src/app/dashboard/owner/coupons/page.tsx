"use client";

import { useState } from "react";

const STAMP_SLOTS = [3, 5, 7, 10];

type CampaignStatus = "검수중" | "반영됨" | "종료";

interface Campaign {
  id: number;
  title: string;
  status: CampaignStatus;
  date: string;
}

const STATUS_STYLE: Record<CampaignStatus, string> = {
  검수중: "bg-amber-100 text-amber-700",
  반영됨: "bg-green-100 text-green-700",
  종료: "bg-gray-100 text-gray-500",
};

const DUMMY_CAMPAIGNS: Campaign[] = [
  { id: 1, title: "여름 특가 쿠폰 10%", status: "검수중", date: "06.24" },
  { id: 2, title: "단골 감사 무료 음료", status: "반영됨", date: "06.10" },
  { id: 3, title: "5월 스탬프 2배 이벤트", status: "종료", date: "05.31" },
];

export default function CouponsPage() {
  const [couponOn, setCouponOn] = useState(true);
  const [stampSlot, setStampSlot] = useState(5);

  return (
    <div className="px-4 pt-4 max-w-lg mx-auto pb-8">
      <h1 className="text-lg font-bold text-navy mb-4">쿠폰·스탬프</h1>

      {/* 쿠폰 ON/OFF */}
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">쿠폰 발급</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {couponOn ? "현재 쿠폰이 활성화되어 있습니다." : "쿠폰이 비활성화되었습니다."}
            </p>
          </div>
          {/* 토글 */}
          <button
            onClick={() => setCouponOn((v) => !v)}
            className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${
              couponOn ? "bg-periwinkle" : "bg-gray-200"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${
                couponOn ? "translate-x-6" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {/* 스탬프 슬롯 선택 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
        <p className="text-sm font-semibold text-gray-800 mb-3">스탬프 목표</p>
        <div className="flex gap-2">
          {STAMP_SLOTS.map((n) => (
            <button
              key={n}
              onClick={() => setStampSlot(n)}
              className={`flex-1 py-2 text-sm font-semibold rounded-xl border-2 transition-colors ${
                stampSlot === n
                  ? "border-periwinkle bg-periwinkle/10 text-periwinkle"
                  : "border-gray-100 text-gray-400 hover:border-gray-200"
              }`}
            >
              {n}개
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {stampSlot}개 적립 시 쿠폰 1매 자동 지급
        </p>

        {/* 스탬프 시각화 */}
        <div className="flex flex-wrap gap-2 mt-3">
          {Array.from({ length: stampSlot }).map((_, i) => (
            <div
              key={i}
              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                i < 3
                  ? "border-periwinkle bg-periwinkle text-white"
                  : "border-gray-200 text-gray-300"
              }`}
            >
              {i < 3 ? "✓" : ""}
            </div>
          ))}
        </div>
      </div>

      {/* 캠페인 목록 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">캠페인</h2>
          <button className="text-xs text-periwinkle font-semibold">+ 추가</button>
        </div>
        <ul className="divide-y divide-gray-50">
          {DUMMY_CAMPAIGNS.map((c) => (
            <li key={c.id} className="flex items-center px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{c.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{c.date}</p>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${
                  STATUS_STYLE[c.status]
                }`}
              >
                {c.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
