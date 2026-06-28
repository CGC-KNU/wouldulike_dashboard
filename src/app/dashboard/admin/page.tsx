"use client";

import { useEffect, useState, useCallback } from "react";

interface Restaurant {
  restaurant_id: number;
  name: string;
}

const DUMMY_CAMPAIGNS = [
  { id: 1, restaurant: "정든밤", title: "여름 특가 10% 쿠폰", submitted: "2026-06-24", status: "검수중" },
  { id: 2, restaurant: "봄봄김밥", title: "단골 무료 음료 이벤트", submitted: "2026-06-23", status: "검수중" },
  { id: 3, restaurant: "오마카세 숲", title: "주말 한정 세트 할인", submitted: "2026-06-22", status: "반영됨" },
];

const STATUS_STYLE: Record<string, string> = {
  검수중: "bg-amber-100 text-amber-700",
  반영됨: "bg-green-100 text-green-700",
  종료: "bg-gray-100 text-gray-500",
};

export default function AdminHomePage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchRestaurants = useCallback((query: string) => {
    setLoading(true);
    const url = query
      ? `/api/dashboard/restaurants?search=${encodeURIComponent(query)}`
      : "/api/dashboard/restaurants";
    fetch(url)
      .then((r) => r.json())
      .then((data) => setRestaurants(data.restaurants ?? []))
      .catch(() => setRestaurants([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchRestaurants("");
  }, [fetchRestaurants]);

  // 300ms 디바운스
  useEffect(() => {
    const timer = setTimeout(() => fetchRestaurants(search), 300);
    return () => clearTimeout(timer);
  }, [search, fetchRestaurants]);

  return (
    <div className="px-4 pt-4 max-w-2xl mx-auto">
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "전체 식당", value: loading ? "—" : restaurants.length },
          { label: "검수 대기", value: DUMMY_CAMPAIGNS.filter((c) => c.status === "검수중").length },
          { label: "이번 달 활성 유저", value: 317 },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-2xl font-bold text-navy mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* 캠페인 검수 대기 */}
      <div className="bg-white rounded-2xl shadow-sm mb-5 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">캠페인 검수</h2>
          <span className="text-xs text-amber-600 font-semibold">
            {DUMMY_CAMPAIGNS.filter((c) => c.status === "검수중").length}건 대기
          </span>
        </div>
        <ul className="divide-y divide-gray-50">
          {DUMMY_CAMPAIGNS.map((c) => (
            <li key={c.id} className="flex items-center px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{c.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {c.restaurant} · {c.submitted}
                </p>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${
                  STATUS_STYLE[c.status]
                }`}
              >
                {c.status}
              </span>
              {c.status === "검수중" && (
                <div className="flex gap-1.5 shrink-0">
                  <button className="text-xs px-3 py-1 bg-green-100 text-green-700 font-semibold rounded-lg hover:bg-green-200 transition-colors">
                    승인
                  </button>
                  <button className="text-xs px-3 py-1 bg-red-50 text-red-500 font-semibold rounded-lg hover:bg-red-100 transition-colors">
                    반려
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* 식당 목록 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-700 shrink-0">제휴 식당</h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="식당명 검색..."
            className="flex-1 text-xs px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
          />
          <span className="text-xs text-gray-400 shrink-0">
            {loading ? "..." : `${restaurants.length}개`}
          </span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
          </div>
        ) : restaurants.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">식당 목록을 불러오지 못했습니다.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {restaurants.map((r) => (
              <li key={r.restaurant_id} className="flex items-center px-4 py-3 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{r.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">ID: {r.restaurant_id}</p>
                </div>
                <a
                  href={`/dashboard/owner?rid=${r.restaurant_id}`}
                  className="text-xs text-periwinkle font-semibold hover:text-navy transition-colors shrink-0"
                >
                  사장님 뷰 →
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
