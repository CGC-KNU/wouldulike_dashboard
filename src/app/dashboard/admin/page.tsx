"use client";

import { useEffect, useState, useCallback } from "react";

interface Restaurant {
  restaurant_id: number;
  name: string;
  tier: string | null;
}

type SortKey = "name" | "tier" | "id";
type SortDir = "asc" | "desc";

const TIER_ORDER: Record<string, number> = { CONTENT: 3, BOOST: 2, FREE: 1 };
const TIER_STYLE: Record<string, string> = {
  FREE: "bg-gray-100 text-gray-600",
  BOOST: "bg-amber-100 text-amber-700",
  CONTENT: "bg-indigo-100 text-indigo-700",
};

const DUMMY_CAMPAIGNS = [
  { id: 1, restaurant: "정든밤", title: "여름 특가 10% 쿠폰", submitted: "2026-06-24", status: "검수중" },
  { id: 2, restaurant: "봄봄김밥", title: "단골 무료 음료 이벤트", submitted: "2026-06-23", status: "검수중" },
  { id: 3, restaurant: "오마카세 숲", title: "주말 한정 세트 할인", submitted: "2026-06-22", status: "반영됨" },
];

const CAMPAIGN_STATUS_STYLE: Record<string, string> = {
  검수중: "bg-amber-100 text-amber-700",
  반영됨: "bg-green-100 text-green-700",
  종료: "bg-gray-100 text-gray-500",
};

function sortRestaurants(list: Restaurant[], key: SortKey, dir: SortDir) {
  return [...list].sort((a, b) => {
    let cmp = 0;
    if (key === "name") {
      cmp = a.name.localeCompare(b.name, "ko");
    } else if (key === "tier") {
      cmp = (TIER_ORDER[b.tier ?? ""] ?? 0) - (TIER_ORDER[a.tier ?? ""] ?? 0);
    } else {
      cmp = a.restaurant_id - b.restaurant_id;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

export default function AdminHomePage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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

  useEffect(() => {
    const timer = setTimeout(() => fetchRestaurants(search), 300);
    return () => clearTimeout(timer);
  }, [search, fetchRestaurants]);

  const sorted = sortRestaurants(restaurants, sortKey, sortDir);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-300 ml-0.5">↕</span>;
    return <span className="text-periwinkle ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

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
                  CAMPAIGN_STATUS_STYLE[c.status]
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
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-8">
        {/* 검색 헤더 */}
        <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700 shrink-0">제휴 식당</h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="식당명 검색..."
            className="flex-1 text-xs px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-periwinkle"
          />
          <span className="text-xs text-gray-400 shrink-0">
            {loading ? "..." : `${sorted.length}개`}
          </span>
        </div>

        {/* 정렬 헤더 */}
        <div className="flex items-center px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
          <button
            onClick={() => toggleSort("id")}
            className="w-10 text-left font-medium hover:text-navy"
          >
            ID <SortIcon k="id" />
          </button>
          <button
            onClick={() => toggleSort("name")}
            className="flex-1 text-left font-medium hover:text-navy"
          >
            식당명 <SortIcon k="name" />
          </button>
          <button
            onClick={() => toggleSort("tier")}
            className="w-24 text-right font-medium hover:text-navy"
          >
            플랜 <SortIcon k="tier" />
          </button>
          <span className="w-16" />
        </div>

        {/* 목록 */}
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">
            {search ? "검색 결과가 없습니다." : "식당 목록을 불러오지 못했습니다."}
          </p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {sorted.map((r) => (
              <li key={r.restaurant_id} className="flex items-center px-4 py-3 gap-2">
                <span className="w-10 text-xs text-gray-400 shrink-0">{r.restaurant_id}</span>
                <p className="flex-1 text-sm font-medium text-gray-800 truncate">{r.name}</p>
                <div className="w-24 flex justify-end">
                  {r.tier ? (
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        TIER_STYLE[r.tier] ?? "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {r.tier}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">미등록</span>
                  )}
                </div>
                <a
                  href={`/dashboard/owner?rid=${r.restaurant_id}`}
                  className="w-16 text-right text-xs text-periwinkle font-semibold hover:text-navy transition-colors shrink-0"
                >
                  뷰 →
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
