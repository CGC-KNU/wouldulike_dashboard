import { cookies } from "next/headers";
import { IS_DEV, DEV_STATS } from "@/lib/dev";

interface Stats {
  revisit_this_month: number;
  loyal_total: number;
  coupon_redeemed_this_month: number;
  stamp_earned_this_month: number;
  restaurant_name: string;
  tier: string;
  month: string;
}

async function fetchStats(token: string): Promise<Stats | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/stats/`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      ...data.stats,
      restaurant_name: data.restaurant_name,
      tier: data.tier,
      month: data.month,
    };
  } catch {
    return null;
  }
}

// 간단한 sparkline SVG (더미 데이터)
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const w = 80;
  const h = 28;
  const step = w / (values.length - 1);
  const pts = values
    .map((v, i) => `${i * step},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <polyline
        points={pts}
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

const TIER_COLORS: Record<string, string> = {
  FREE: "bg-gray-200 text-gray-600",
  BOOST: "bg-amber-400 text-amber-900",
  CONTENT: "bg-indigo-500 text-white",
};

export default async function OwnerHomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value ?? "";

  const stats: Stats =
    IS_DEV
      ? DEV_STATS as unknown as Stats
      : (await fetchStats(token)) ?? (DEV_STATS as unknown as Stats);

  const month = stats.month
    ? new Date(stats.month + "-01").toLocaleDateString("ko-KR", { year: "numeric", month: "long" })
    : "";

  const sparkData = [5, 12, 8, 20, 15, 24]; // 더미 sparkline

  return (
    <div className="px-4 pt-4 max-w-lg mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-gray-400">{month}</p>
          <h1 className="text-lg font-bold text-navy">{stats.restaurant_name}</h1>
        </div>
        <span
          className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
            TIER_COLORS[stats.tier] ?? "bg-gray-200 text-gray-600"
          }`}
        >
          {stats.tier}
        </span>
      </div>

      {/* 다크 히어로 카드 — 재방문 단골 */}
      <div
        className="rounded-2xl p-5 mb-4 text-white"
        style={{ background: "linear-gradient(135deg,#0A0676 0%,#182031 100%)" }}
      >
        <p className="text-xs text-white/60 mb-3">이번 달 재방문 단골</p>
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold">{stats.revisit_this_month}</span>
              <span className="text-sm text-white/70">명</span>
            </div>
            <p className="mt-1 text-xs text-white/50">
              누적 단골&nbsp;
              <span className="font-semibold text-white/80">{stats.loyal_total}명</span>
            </p>
          </div>
          <div className="opacity-80">
            <Sparkline values={sparkData} />
          </div>
        </div>
      </div>

      {/* 지표 2분할 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">쿠폰 사용</p>
          <p className="text-2xl font-bold text-navy">
            {stats.coupon_redeemed_this_month}
            <span className="text-sm font-normal text-gray-400 ml-1">건</span>
          </p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">스탬프 적립</p>
          <p className="text-2xl font-bold text-navy">
            {stats.stamp_earned_this_month}
            <span className="text-sm font-normal text-gray-400 ml-1">건</span>
          </p>
        </div>
      </div>

      {/* 할 일 알림 */}
      <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">할 일</h2>
          <span className="text-xs text-periwinkle font-medium">2</span>
        </div>
        <ul>
          <li className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span className="text-sm text-gray-700">캠페인 검수 결과 확인</span>
            <span className="ml-auto text-xs text-gray-300">1일 전</span>
          </li>
          <li className="flex items-center gap-3 px-4 py-3">
            <span className="w-2 h-2 rounded-full bg-periwinkle shrink-0" />
            <span className="text-sm text-gray-700">스탬프 보상 쿠폰 설정</span>
            <span className="ml-auto text-xs text-gray-300">새로운</span>
          </li>
        </ul>
      </div>

      {/* 빠른 실행 */}
      <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">빠른 실행</h2>
        </div>
        <div className="grid grid-cols-3 divide-x divide-gray-50">
          {[
            { label: "쿠폰 관리", href: "/dashboard/owner/coupons", emoji: "🎟" },
            { label: "캠페인", href: "/dashboard/owner/marketing", emoji: "📣" },
            { label: "식당 정보", href: "/dashboard/owner/restaurant", emoji: "🏠" },
          ].map(({ label, href, emoji }) => (
            <a
              key={label}
              href={href}
              className="flex flex-col items-center gap-1.5 py-4 hover:bg-gray-50 transition-colors"
            >
              <span className="text-xl">{emoji}</span>
              <span className="text-xs text-gray-600 font-medium">{label}</span>
            </a>
          ))}
        </div>
      </div>

      {/* BOOST 업셀 스트립 */}
      {stats.tier === "FREE" && (
        <a
          href="/dashboard/owner/plan"
          className="block w-full rounded-2xl p-4 mb-6 text-white text-sm"
          style={{ background: "linear-gradient(90deg,#6366E0,#0A0676)" }}
        >
          <p className="font-bold">📈 BOOST로 업그레이드</p>
          <p className="text-white/70 text-xs mt-0.5">
            월 ₩30,000 — 매출 기여 분석 + 캠페인 1건 포함
          </p>
        </a>
      )}
    </div>
  );
}
