// 관리자 대시보드 홈
// 실제 데이터는 추후 API 연동 — 현재는 더미

const DUMMY_CAMPAIGNS = [
  { id: 1, restaurant: "정든밤", title: "여름 특가 10% 쿠폰", submitted: "2026-06-24", status: "검수중" },
  { id: 2, restaurant: "봄봄김밥", title: "단골 무료 음료 이벤트", submitted: "2026-06-23", status: "검수중" },
  { id: 3, restaurant: "오마카세 숲", title: "주말 한정 세트 할인", submitted: "2026-06-22", status: "반영됨" },
];

const DUMMY_RESTAURANTS = [
  { id: 101, name: "정든밤", tier: "BOOST", owners: 1 },
  { id: 102, name: "봄봄김밥", tier: "FREE", owners: 2 },
  { id: 103, name: "오마카세 숲", tier: "CONTENT", owners: 1 },
  { id: 104, name: "새벽감성", tier: "FREE", owners: 0 },
];

const TIER_STYLE: Record<string, string> = {
  FREE: "bg-gray-100 text-gray-600",
  BOOST: "bg-amber-100 text-amber-700",
  CONTENT: "bg-indigo-100 text-indigo-700",
};

const STATUS_STYLE: Record<string, string> = {
  검수중: "bg-amber-100 text-amber-700",
  반영됨: "bg-green-100 text-green-700",
  종료: "bg-gray-100 text-gray-500",
};

export default function AdminHomePage() {
  return (
    <div className="px-4 pt-4 max-w-2xl mx-auto">
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "전체 식당", value: 4 },
          { label: "검수 대기", value: 2 },
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
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">제휴 식당</h2>
          <span className="text-xs text-gray-400">{DUMMY_RESTAURANTS.length}개</span>
        </div>
        <ul className="divide-y divide-gray-50">
          {DUMMY_RESTAURANTS.map((r) => (
            <li key={r.id} className="flex items-center px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{r.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">점주 {r.owners}명</p>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  TIER_STYLE[r.tier]
                }`}
              >
                {r.tier}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
