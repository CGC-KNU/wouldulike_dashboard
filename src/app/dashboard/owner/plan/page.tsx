import { cookies } from "next/headers";

/* ─── 플랜 정의 ─────────────────────────────────────── */
const PLANS = [
  {
    id: "FREE",
    displayName: "Free",
    emoji: "🌱",
    price: "0원",
    priceSub: "/ 월",
    badge: null as string | null,
    ringCls: "ring-gray-200 border-gray-200",
    bgCls: "bg-gray-50",
    currentBadgeCls: "bg-gray-700 text-white",
    recommendBadgeCls: "",
    checkBoldCls: "text-gray-600",
    checkLightCls: "text-gray-300",
    dividerCls: "bg-gray-200",
    features: [
      { text: "쿠폰·스탬프 기본 운영", bold: false },
      { text: "대학가 식당 리스트 노출", bold: false },
    ],
  },
  {
    id: "BOOST",
    displayName: "Boost",
    emoji: "🚀",
    price: "30,000원",
    priceSub: "/ 월",
    badge: "추천",
    ringCls: "ring-amber-300 border-amber-300",
    bgCls: "bg-gradient-to-br from-amber-50 to-orange-50",
    currentBadgeCls: "bg-amber-500 text-white",
    recommendBadgeCls: "bg-amber-400 text-white",
    checkBoldCls: "text-amber-500",
    checkLightCls: "text-amber-300",
    dividerCls: "bg-amber-100",
    features: [
      { text: "테마 기획전 보장 편입", bold: true },
      { text: "한정 쿠폰 캠페인 대행", bold: true },
      { text: "앱 노출 (배너·푸시)", bold: true },
      { text: "홍보물 제작·비치 (포스터·QR 스티커)", bold: true },
      { text: "쿠폰·스탬프 기본 운영", bold: false },
      { text: "대학가 식당 리스트 노출", bold: false },
    ],
  },
  {
    id: "CONTENT",
    displayName: "Premium",
    emoji: "👑",
    price: "80,000원~",
    priceSub: "/ 월",
    badge: null as string | null,
    ringCls: "ring-indigo-300 border-indigo-300",
    bgCls: "bg-gradient-to-br from-indigo-50 to-purple-50",
    currentBadgeCls: "bg-indigo-600 text-white",
    recommendBadgeCls: "",
    checkBoldCls: "text-indigo-500",
    checkLightCls: "text-indigo-300",
    dividerCls: "bg-indigo-100",
    features: [
      { text: "인스타 단독 콘텐츠 월 1건", bold: true },
      { text: "고정 알림·배너 노출", bold: true },
      { text: "Boost 모든 기능 포함", bold: false },
    ],
  },
];

/* ─── 페이지 ─────────────────────────────────────────── */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ rid?: string }>;
}) {
  const { rid } = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value ?? "";

  let tier = "FREE";
  let restaurantName = "";
  try {
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/stats/`);
    if (rid) url.searchParams.set("restaurant_id", rid);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      tier = data.tier ?? "FREE";
      restaurantName = data.restaurant_name ?? "";
    }
  } catch { /* 무시 */ }

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto pb-10">
      {/* 헤더 */}
      <div className="mb-6">
        {restaurantName && (
          <p className="text-xs text-gray-400 mb-0.5">{restaurantName}</p>
        )}
        <h1 className="text-xl font-bold text-navy">이용 플랜</h1>
        <p className="text-xs text-gray-400 mt-1">
          플랜은 계약 기간(한 학기) 동안 유지됩니다
        </p>
      </div>

      {/* 플랜 카드 */}
      <div className="flex flex-col gap-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === tier;
          return (
            <div
              key={plan.id}
              className={`
                relative rounded-2xl border-2 p-5 transition-all duration-200
                ${plan.bgCls}
                ${isCurrent
                  ? `${plan.ringCls} ring-2 shadow-md`
                  : "border-transparent opacity-60"
                }
              `}
            >
              {/* 뱃지 영역 */}
              <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5">
                {isCurrent && (
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${plan.currentBadgeCls}`}>
                    현재 이용 중
                  </span>
                )}
                {plan.badge && (
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${plan.recommendBadgeCls}`}>
                    {plan.badge}
                  </span>
                )}
              </div>

              {/* 플랜명 */}
              <div className="flex items-center gap-2 mb-1 pr-20">
                <span className="text-2xl">{plan.emoji}</span>
                <span className="text-lg font-bold text-gray-800">{plan.displayName}</span>
              </div>

              {/* 가격 */}
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-extrabold text-gray-900">{plan.price}</span>
                <span className="text-xs text-gray-400 font-normal">{plan.priceSub}</span>
              </div>

              {/* 구분선 */}
              <div className={`h-px w-full mb-4 ${plan.dividerCls}`} />

              {/* 기능 목록 */}
              <ul className="flex flex-col gap-2.5">
                {plan.features.map((f) => (
                  <li
                    key={f.text}
                    className={`flex items-start gap-2.5 text-sm ${
                      f.bold ? "text-gray-800 font-medium" : "text-gray-500"
                    }`}
                  >
                    <span className={`shrink-0 mt-0.5 font-bold ${f.bold ? plan.checkBoldCls : plan.checkLightCls}`}>
                      ✓
                    </span>
                    {f.text}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* 하단 안내 */}
      <div className="mt-6 bg-white rounded-2xl shadow-sm px-5 py-4">
        <p className="text-xs text-gray-500 leading-relaxed text-center">
          플랜 변경이 필요하시면{" "}
          <span className="font-semibold text-gray-700">우주라이크 팀</span>에 직접 문의해주세요.
        </p>
      </div>
    </div>
  );
}
