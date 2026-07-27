import { cookies } from "next/headers";

interface PlanDef {
  id: string;
  name: string;
  color: string;
  features: string[];
}

const PLANS: PlanDef[] = [
  {
    id: "FREE",
    name: "FREE",
    color: "#6B7280",
    features: [
      "재방문 단골 수 확인",
      "쿠폰·스탬프 기본 관리",
      "QR / 포스터 홍보 키트",
    ],
  },
  {
    id: "BOOST",
    name: "BOOST",
    color: "#E0A23C",
    features: [
      "재방문 단골 수 확인",
      "캠페인 참여 (월 1건)",
      "단골 푸시 알림 발송",
      "QR / 포스터 홍보 키트",
    ],
  },
  {
    id: "CONTENT",
    name: "CONTENT",
    color: "#6366E0",
    features: [
      "BOOST 모든 기능",
      "캠페인 무제한",
      "인스타 매거진 자동 제작",
      "전담 마케터 월 1회 상담",
    ],
  },
];

const TIER_BG: Record<string, string> = {
  FREE: "bg-gray-100",
  BOOST: "bg-amber-50",
  CONTENT: "bg-indigo-50",
};

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
  } catch {
    /* 무시 */
  }

  const currentPlan = PLANS.find((p) => p.id === tier) ?? PLANS[0];

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto pb-8">
      {/* 헤더 */}
      <div className="mb-5">
        <p className="text-xs text-gray-400 mb-0.5">{restaurantName}</p>
        <h1 className="text-lg font-bold text-navy">이용 플랜</h1>
      </div>

      {/* 현재 플랜 카드 */}
      <div className={`rounded-2xl overflow-hidden mb-3 ${TIER_BG[tier] ?? "bg-gray-50"}`}>
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full text-white"
              style={{ background: currentPlan.color }}
            >
              {currentPlan.name}
            </span>
            <span className="text-xs text-gray-500 font-medium">현재 이용 중</span>
          </div>

          <ul className="flex flex-col gap-2.5">
            {currentPlan.features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] shrink-0 mt-0.5"
                  style={{ background: currentPlan.color }}
                >
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 안내 */}
      <div className="bg-white rounded-2xl shadow-sm px-5 py-4 text-center">
        <p className="text-xs text-gray-400 leading-relaxed">
          플랜 변경이 필요하시면
          <br />
          <span className="font-semibold text-gray-600">우주라이크 팀</span>에 문의해주세요.
        </p>
      </div>
    </div>
  );
}
