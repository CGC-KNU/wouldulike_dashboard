import { cookies } from "next/headers";

/* ─── SVG 아이콘 ─────────────────────────────────────── */
function IcLeaf({ cls = "" }: { cls?: string }) {
  return (
    <svg width="24" height="24" className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
    </svg>
  );
}

function IcZap({ cls = "" }: { cls?: string }) {
  return (
    <svg width="24" height="24" className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}

function IcCrown({ cls = "" }: { cls?: string }) {
  return (
    <svg width="24" height="24" className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h20M5 20l2-8 5 4 5-4 2 8"/>
      <circle cx="12" cy="8" r="2"/>
      <circle cx="4" cy="10" r="1.5"/>
      <circle cx="20" cy="10" r="1.5"/>
    </svg>
  );
}

function IcCheck({ bold = false, cls = "" }: { bold?: boolean; cls?: string }) {
  return (
    <svg width="14" height="14" className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={bold ? "2.5" : "2"} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

/* ─── 플랜 정의 ─────────────────────────────────────── */
const PLANS = [
  {
    id: "FREE",
    displayName: "Free",
    Icon: IcLeaf,
    iconCls: "text-gray-500",
    iconBg: "bg-gray-100",
    price: "0원",
    priceSub: "/ 월",
    badge: null as string | null,
    cardCls: "bg-gray-50 border-gray-200",
    activeCls: "ring-2 ring-gray-300 border-gray-300 shadow-md",
    currentBadgeCls: "bg-gray-700 text-white",
    recommendBadgeCls: "",
    checkBoldCls: "text-gray-600",
    checkLightCls: "text-gray-300",
    dividerCls: "bg-gray-200",
    priceCls: "text-gray-900",
  },
  {
    id: "BOOST",
    displayName: "Boost",
    Icon: IcZap,
    iconCls: "text-amber-500",
    iconBg: "bg-amber-100",
    price: "30,000원",
    priceSub: "/ 월",
    badge: "추천",
    cardCls: "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200",
    activeCls: "ring-2 ring-amber-400 border-amber-400 shadow-md",
    currentBadgeCls: "bg-amber-500 text-white",
    recommendBadgeCls: "bg-amber-400 text-white",
    checkBoldCls: "text-amber-500",
    checkLightCls: "text-amber-200",
    dividerCls: "bg-amber-100",
    priceCls: "text-gray-900",
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
    Icon: IcCrown,
    iconCls: "text-periwinkle",
    iconBg: "bg-periwinkle/10",
    price: "80,000원~",
    priceSub: "/ 월",
    badge: null as string | null,
    cardCls: "bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200",
    activeCls: "ring-2 ring-periwinkle border-periwinkle shadow-md",
    currentBadgeCls: "bg-periwinkle text-white",
    recommendBadgeCls: "",
    checkBoldCls: "text-periwinkle",
    checkLightCls: "text-indigo-200",
    dividerCls: "bg-indigo-100",
    priceCls: "text-gray-900",
    features: [
      { text: "인스타 단독 콘텐츠 월 1건", bold: true },
      { text: "고정 알림·배너 노출", bold: true },
      { text: "Boost 모든 기능 포함", bold: false },
    ],
  },
].map((p) => ({
  ...p,
  features: p.features ?? [
    { text: "쿠폰·스탬프 기본 운영", bold: false },
    { text: "대학가 식당 리스트 노출", bold: false },
  ],
}));

/* ─── 페이지 ─────────────────────────────────────────── */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ rid?: string }>;
}) {
  const { rid } = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value ?? "";

  /**
   * **못 읽었으면 못 읽었다고 한다** (0924).
   *
   * 전에는 `tier` 를 "FREE" 로 초기화하고 성공했을 때만 덮어썼다. 예외는 삼켰다.
   * 그래서 토큰이 만료됐거나 서버가 한 번 느린 것뿐인데, 월 5만 원 내는 사장님이
   * Free 카드에 **"현재 이용 중"** 배지가 붙은 화면을 봤다. 모르면 아무 카드도 켜지 않는다.
   *
   * 원본도 홈과 같은 한 벌로 바꿨다. 전에는 `/api/dashboard/stats/` 를 따로 읽어서
   * 같은 매장의 등급이 홈과 여기서 다르게 나올 수 있었다.
   */
  let home: { store: { name: string; tier: string | null; contract_ends_on: string | null };
              billing: { monthly_fee: number | null; pay_cycle: string | null } } | null = null;
  try {
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/astro/partner/home/`);
    if (rid) url.searchParams.set("restaurant_id", rid);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    // 0925: 파싱이 실패하면 **null 이어야 한다.** `{}` 는 참이라 화면이 '읽었다'고 믿고 store.name 에서 터진다.
    if (res.ok) home = await res.json().catch(() => null);
  } catch { home = null; }

  const tier = home?.store.tier ?? null;
  const restaurantName = home?.store.name ?? "";
  const myFee = home?.billing.monthly_fee ?? null;
  const endsOn = home?.store.contract_ends_on ?? null;

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto pb-10">
      {/* 헤더 */}
      <div className="mb-6">
        {restaurantName && (
          <p className="text-xs text-gray-400 mb-0.5">{restaurantName}</p>
        )}
        <h1 className="text-xl font-bold text-navy">이용 플랜</h1>
        {/* 0924: 전에는 모든 매장에 "한 학기 동안 유지됩니다" 라고 단정했다. 계약 종료일이
            응답에 들어 있으므로 아는 매장에는 그 날짜를, 모르는 매장에는 아무 말도 하지 않는다. */}
        {endsOn && (
          <p className="text-xs text-gray-400 mt-1">
            지금 계약은 {endsOn.slice(0, 4)}년 {+endsOn.slice(5, 7)}월 {+endsOn.slice(8, 10)}일까지입니다
          </p>
        )}
      </div>

      {home === null ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center mb-4">
          <p className="text-sm font-semibold text-gray-800">지금 플랜을 확인하지 못했습니다</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            아래는 플랜별 기준 안내입니다. 사장님 매장이 어느 플랜인지는 잠시 뒤 다시 열어 주세요.
          </p>
        </div>
      ) : myFee !== null ? (
        <div className="rounded-2xl border border-navy/20 bg-navy/[0.04] p-4 mb-4">
          <p className="text-[12px] text-gray-500">지금 내고 계신 금액</p>
          <p className="text-[19px] font-bold text-gray-900 mt-0.5 tabular-nums">
            월 {myFee.toLocaleString()}원
            <span className="text-[11.5px] font-medium text-gray-400 ml-1.5">부가세 별도</span>
          </p>
          {home.billing.pay_cycle && (
            <p className="text-[11.5px] text-gray-500 mt-1">
              {home.billing.pay_cycle === "LUMP" ? "일시납" : "월납 · 매월 1일"}
            </p>
          )}
        </div>
      ) : null}

      {/* 플랜 카드 */}
      <div className="flex flex-col gap-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === tier;
          const { Icon } = plan;
          return (
            <div
              key={plan.id}
              className={`
                relative rounded-2xl border-2 p-5 transition-all duration-200
                ${plan.cardCls}
                ${isCurrent ? plan.activeCls : "border-transparent opacity-55"}
              `}
            >
              {/* 뱃지 영역 */}
              <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5">
                {isCurrent && (
                  <span className={`text-[11.5px] font-bold px-2.5 py-1 rounded-full ${plan.currentBadgeCls}`}>
                    현재 이용 중
                  </span>
                )}
                {plan.badge && (
                  <span className={`text-[11.5px] font-bold px-2.5 py-1 rounded-full ${plan.recommendBadgeCls}`}>
                    {plan.badge}
                  </span>
                )}
              </div>

              {/* 플랜명 + 아이콘 */}
              <div className="flex items-center gap-2.5 mb-3 pr-20">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${plan.iconBg}`}>
                  <Icon cls={plan.iconCls} />
                </div>
                <span className="text-lg font-bold text-gray-800">{plan.displayName}</span>
              </div>

              {/* 가격 */}
              <div className="flex items-baseline gap-1 mb-4">
                <span className={`text-3xl font-extrabold ${plan.priceCls}`}>{plan.price}</span>
                {/* 0924: 이 숫자는 화면에 박아 둔 **기준** 가격이다. 상권·계약에 따라 달라지므로
                    사장님이 실제로 내는 금액은 위 '지금 내고 계신 금액' 에 따로 적는다. */}
                <span className="text-xs text-gray-400 font-normal">{plan.priceSub} · 기준</span>
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
                    <span className={`shrink-0 mt-0.5 ${f.bold ? plan.checkBoldCls : plan.checkLightCls}`}>
                      <IcCheck bold={f.bold} />
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
      <div className="mt-6 bg-white/85 backdrop-blur rounded-[18px] border border-white/70 shadow-[0_1px_2px_rgba(16,24,40,0.04)] px-5 py-4">
        <p className="text-xs text-gray-500 leading-relaxed text-center">
          플랜을 바꾸고 싶으시면 담당자에게 말씀해 주세요. 급하시면{" "}
          <a href="mailto:hello@wouldulike.kr" className="font-semibold text-navy">hello@wouldulike.kr</a>
        </p>
      </div>
    </div>
  );
}
