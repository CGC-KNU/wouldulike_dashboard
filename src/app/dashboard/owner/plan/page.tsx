"use client";

const PLANS = [
  {
    id: "FREE",
    name: "FREE",
    price: "무료",
    color: "#6B7280",
    features: [
      "재방문 단골 수 확인",
      "쿠폰·스탬프 기본 관리",
      "QR / 포스터 홍보 키트",
    ],
    locked: [],
  },
  {
    id: "BOOST",
    name: "BOOST",
    price: "₩30,000 / 월",
    color: "#E0A23C",
    features: [
      "FREE 모든 기능",
      "매출 기여 분석",
      "시간대별 방문 패턴",
      "캠페인 1건 포함",
    ],
    locked: [],
    highlight: true,
  },
  {
    id: "CONTENT",
    name: "CONTENT",
    price: "₩80,000 / 월",
    color: "#6366E0",
    features: [
      "BOOST 모든 기능",
      "인스타 매거진 자동 제작",
      "캠페인 무제한",
      "전담 마케터 월 1회 상담",
    ],
    locked: [],
  },
];

export default function PlanPage() {
  // 개발 더미: 현재 BOOST 구독 중
  const currentTier = "BOOST";

  return (
    <div className="px-4 pt-4 max-w-lg mx-auto pb-8">
      <h1 className="text-lg font-bold text-navy mb-1">플랜</h1>
      <p className="text-xs text-gray-400 mb-5">
        현재 플랜:{" "}
        <span className="font-semibold text-gray-700">{currentTier}</span>
      </p>

      <div className="flex flex-col gap-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentTier;
          return (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl shadow-sm overflow-hidden border-2 transition-colors ${
                isCurrent ? "border-periwinkle" : "border-transparent"
              }`}
            >
              {/* 플랜 헤더 */}
              <div
                className="px-5 py-4"
                style={{
                  background:
                    plan.id === "BOOST"
                      ? "linear-gradient(90deg,#E0A23C22,#E0A23C08)"
                      : plan.id === "CONTENT"
                      ? "linear-gradient(90deg,#6366E022,#6366E008)"
                      : undefined,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-bold px-2.5 py-0.5 rounded-full text-white"
                      style={{ background: plan.color }}
                    >
                      {plan.name}
                    </span>
                    {plan.highlight && (
                      <span className="text-xs text-amber-600 font-semibold">추천</span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-gray-800">{plan.price}</span>
                </div>
              </div>

              {/* 기능 목록 */}
              <ul className="px-5 py-3 flex flex-col gap-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="text-green-500 text-xs">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className="px-5 pb-4">
                {isCurrent ? (
                  <div className="w-full py-2.5 text-center text-sm font-semibold text-periwinkle bg-periwinkle/10 rounded-xl">
                    현재 플랜
                  </div>
                ) : (
                  <button
                    className="w-full py-2.5 text-sm font-semibold text-white rounded-xl transition-opacity hover:opacity-80"
                    style={{ background: plan.color }}
                  >
                    {plan.id === "FREE" ? "다운그레이드" : "업그레이드"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 text-center mt-5">
        구독 변경은 익월 1일부터 적용됩니다.
      </p>
    </div>
  );
}
