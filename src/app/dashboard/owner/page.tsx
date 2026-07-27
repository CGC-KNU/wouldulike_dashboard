import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decodeJwt } from "@/lib/jwt";
import Link from "next/link";

/* ─── 타입 ────────────────────────────────────────── */
interface Stats {
  revisit_this_month: number;
  loyal_total: number;
  wishlist_count: number;
  restaurant_name: string;
  tier: string;
}

interface CampaignApp {
  id: number;
  week_start: string;  // "YYYY-MM-DD"
  week_end: string;
  campaign_type: string;
  status: string;
  admin_notes: string;
  coupon_title: string;
  campaign_description: string;
}

interface NotifSchedule {
  id: number;
  date: string;
  slot: "noon" | "evening";
  content: string;
  scheduled_datetime: string;
  sent: boolean;
  sent_at: string | null;
}

/* ─── 상수 ────────────────────────────────────────── */
const TIER_BADGE: Record<string, string> = {
  FREE: "bg-gray-200 text-gray-600",
  BOOST: "bg-amber-400 text-amber-900",
  CONTENT: "bg-indigo-500 text-white",
};

const CAMP_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING:       { label: "검토중", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  APPROVED:      { label: "진행",   cls: "bg-green-50 text-green-700 border-green-200" },
  REJECTED_HOLD: { label: "보류",   cls: "bg-orange-50 text-orange-700 border-orange-200" },
  REJECTED:      { label: "반려",   cls: "bg-red-50 text-red-600 border-red-200" },
  CANCELLED:     { label: "취소",   cls: "bg-gray-100 text-gray-400 border-gray-200" },
};

const CAMP_TYPE: Record<string, { week: number; label: string; icon: string; color: string }> = {
  BANNER:          { week: 1, label: "배너",           icon: "📌", color: "bg-sky-50 text-sky-700 border-sky-200" },
  COUPON_CAMPAIGN: { week: 2, label: "한정쿠폰 캠페인", icon: "🎟", color: "bg-violet-50 text-violet-700 border-violet-200" },
  MILEAGE_DOUBLE:  { week: 3, label: "마일리지 2배",    icon: "⚡", color: "bg-amber-50 text-amber-700 border-amber-200" },
  INSTANT_BANNER:  { week: 4, label: "즉석 배너",       icon: "📣", color: "bg-rose-50 text-rose-700 border-rose-200" },
};

const SLOT_LABEL: Record<string, string> = { noon: "정오", evening: "저녁" };

/* ─── 데이터 패치 ──────────────────────────────────── */
async function fetchStats(token: string, rid?: string): Promise<Stats | null> {
  try {
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/stats/`);
    if (rid) url.searchParams.set("restaurant_id", rid);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      revisit_this_month: data.stats?.revisit_this_month ?? 0,
      loyal_total: data.stats?.loyal_total ?? 0,
      wishlist_count: data.stats?.wishlist_count ?? 0,
      restaurant_name: data.restaurant_name ?? "",
      tier: data.tier ?? "FREE",
    };
  } catch { return null; }
}

async function fetchCampaigns(token: string): Promise<CampaignApp[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/owner/campaigns/`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function fetchNotifications(token: string): Promise<NotifSchedule[]> {
  const today = new Date();
  const thisYear = today.getFullYear();
  const thisMonth = today.getMonth() + 1;
  const nextDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextYear = nextDate.getFullYear();
  const nextMonth = nextDate.getMonth() + 1;

  const fetchMonth = async (year: number, month: number) => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/owner/notification-schedule/?year=${year}&month=${month}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  };

  const [cur, next] = await Promise.all([
    fetchMonth(thisYear, thisMonth),
    fetchMonth(nextYear, nextMonth),
  ]);
  return [...cur, ...next];
}

/* ─── 유틸 ────────────────────────────────────────── */
function fmtDate(dateStr: string) {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function notifStatus(n: NotifSchedule): { label: string; cls: string } {
  if (n.sent) return { label: "발송완료", cls: "bg-green-50 text-green-700 border-green-200" };
  const scheduledMs = new Date(n.scheduled_datetime).getTime();
  if (scheduledMs > Date.now()) return { label: "예정", cls: "bg-blue-50 text-blue-600 border-blue-200" };
  return { label: "미발송", cls: "bg-gray-100 text-gray-400 border-gray-200" };
}

/* ─── 컴포넌트 ─────────────────────────────────────── */
export default async function OwnerHomePage({
  searchParams,
}: {
  searchParams: Promise<{ rid?: string }>;
}) {
  const { rid } = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value ?? "";

  // 관리자 JWT인데 rid 없으면 admin 페이지로
  try {
    const payload = decodeJwt<{ is_admin?: boolean }>(token);
    if (payload.is_admin && !rid) redirect("/dashboard/admin");
  } catch { /* 무시 */ }

  const [stats, allCampaigns, allNotifs] = await Promise.all([
    fetchStats(token, rid),
    fetchCampaigns(token),
    fetchNotifications(token),
  ]);

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-gray-400 text-sm">식당 정보를 불러오지 못했습니다.</p>
      </div>
    );
  }

  const ridParam = rid ? `?rid=${rid}` : "";

  // 캠페인: 날짜 역순 정렬 후 최신 8건 (이번 주 + 주변 일정)
  const todayStr = now.toISOString().slice(0, 10);
  const campaigns = [...allCampaigns]
    .sort((a, b) => b.week_start.localeCompare(a.week_start))
    .slice(0, 8);

  // 현재 진행 중인 캠페인 (이번 주)
  const activeCampaign = allCampaigns.find((c) => {
    return c.week_start <= todayStr && todayStr <= c.week_end && c.status === "APPROVED";
  }) ?? null;

  // 알림: 예정 먼저 → 완료/미발송
  const upcoming = allNotifs
    .filter((n) => !n.sent && new Date(n.scheduled_datetime).getTime() > Date.now())
    .sort((a, b) => a.scheduled_datetime.localeCompare(b.scheduled_datetime));
  const past = allNotifs
    .filter((n) => n.sent || new Date(n.scheduled_datetime).getTime() <= Date.now())
    .sort((a, b) => b.scheduled_datetime.localeCompare(a.scheduled_datetime))
    .slice(0, 2);
  const notifs = [...upcoming, ...past].slice(0, 5);

  const now = new Date();
  const monthLabel = now.toLocaleDateString("ko-KR", { year: "numeric", month: "long" });

  return (
    <div className="px-4 pt-5 max-w-lg mx-auto pb-8 flex flex-col gap-4">

      {/* ── 헤더 ── */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] text-gray-400">{monthLabel}</p>
          <h1 className="text-xl font-bold text-navy leading-tight">{stats.restaurant_name}</h1>
        </div>
        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-full mt-1 ${
            TIER_BADGE[stats.tier] ?? "bg-gray-200 text-gray-600"
          }`}
        >
          {stats.tier}
        </span>
      </div>

      {/* ── 핵심 지표 2개 ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl shadow-sm px-4 py-4">
          <p className="text-[11px] text-gray-400 mb-1">이번 달 재방문</p>
          <p className="text-2xl font-bold text-navy">
            {stats.revisit_this_month}
            <span className="text-sm font-normal text-gray-400 ml-1">명</span>
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            누적 단골 <span className="font-semibold text-gray-600">{stats.loyal_total}명</span>
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm px-4 py-4">
          <p className="text-[11px] text-gray-400 mb-1">찜한 사용자</p>
          <p className="text-2xl font-bold text-navy">
            {stats.wishlist_count ?? 0}
            <span className="text-sm font-normal text-gray-400 ml-1">명</span>
          </p>
          <p className="text-[11px] text-gray-400 mt-1">알림 발송 대상</p>
        </div>
      </div>

      {/* ── 마케팅 현황 ── */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b border-gray-50">
          <h2 className="text-sm font-bold text-gray-800">마케팅 현황</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">계약 일정에 따라 자동 운영됩니다</p>
        </div>

        {/* 이번 주 활성 캠페인 강조 */}
        {activeCampaign ? (() => {
          const tp = CAMP_TYPE[activeCampaign.campaign_type] ?? CAMP_TYPE.COUPON_CAMPAIGN;
          return (
            <div className="mx-4 mt-3 mb-1 rounded-xl border border-dashed border-green-200 bg-green-50 px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{tp.icon}</span>
                <span className="text-xs font-bold text-green-700">이번 주 진행 중</span>
              </div>
              <p className="text-sm font-semibold text-green-800">{tp.week}주차 · {tp.label}</p>
              <p className="text-[11px] text-green-600 mt-0.5">
                {fmtDate(activeCampaign.week_start)} ~ {fmtDate(activeCampaign.week_end)}
              </p>
            </div>
          );
        })() : (
          <div className="mx-4 mt-3 mb-1 rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-400">이번 주 진행 중인 캠페인이 없습니다</p>
          </div>
        )}

        {/* 캠페인 타임라인 */}
        <div className="px-4 pt-3 pb-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">캠페인 일정</p>
          {campaigns.length === 0 ? (
            <p className="text-xs text-gray-300 py-2">등록된 캠페인이 없습니다</p>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-50">
              {campaigns.map((c) => {
                const st = CAMP_STATUS[c.status] ?? CAMP_STATUS.PENDING;
                const tp = CAMP_TYPE[c.campaign_type] ?? CAMP_TYPE.COUPON_CAMPAIGN;
                const isActive = c.week_start <= todayStr && todayStr <= c.week_end && c.status === "APPROVED";
                return (
                  <li key={c.id} className={`flex items-center gap-3 py-2.5 ${isActive ? "opacity-100" : c.week_start < todayStr ? "opacity-60" : ""}`}>
                    <span className="text-base shrink-0">{tp.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-500">
                        {fmtDate(c.week_start)} ~ {fmtDate(c.week_end)}
                        {isActive && <span className="ml-1.5 text-green-600 font-semibold">● 진행중</span>}
                      </p>
                      <p className="text-sm font-medium text-gray-700 mt-0.5">
                        <span className="text-gray-400 font-normal mr-1">{tp.week}주</span>{tp.label}
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${st.cls}`}>
                      {st.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mx-4 border-t border-gray-50 my-2" />

        {/* 알림 예약 */}
        <div className="px-4 pt-1 pb-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">알림 발송 일정</p>
          {notifs.length === 0 ? (
            <p className="text-xs text-gray-300 py-2">예약된 알림이 없습니다</p>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-50">
              {notifs.map((n) => {
                const st = notifStatus(n);
                return (
                  <li key={n.id} className="flex items-center gap-3 py-2.5">
                    <span className="text-base shrink-0">🔔</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-500">
                        {fmtDate(n.date)} {SLOT_LABEL[n.slot]}
                      </p>
                      {n.content && (
                        <p className="text-sm font-medium text-gray-700 mt-0.5 truncate">{n.content}</p>
                      )}
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${st.cls}`}>
                      {st.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── 식당 정보 링크 ── */}
      <Link
        href={`/dashboard/owner/restaurant${ridParam}`}
        className="flex items-center justify-between bg-white rounded-2xl shadow-sm px-4 py-3.5 text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors"
      >
        <span>식당 정보 수정</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </div>
  );
}
