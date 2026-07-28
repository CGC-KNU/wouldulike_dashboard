import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decodeJwt } from "@/lib/jwt";
import HomeContent from "./HomeContent";

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
  week_start: string;
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

interface CouponBenefit {
  id: number;
  coupon_type_code: string;
  benefit_json: Record<string, unknown>;
  title: string;
  subtitle: string;
  notes: string;
  active: boolean;
}

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
      loyal_total:        data.stats?.loyal_total        ?? 0,
      wishlist_count:     data.stats?.wishlist_count     ?? 0,
      restaurant_name:    data.restaurant_name           ?? "",
      tier:               data.tier                      ?? "FREE",
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

  const nextDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const [cur, next] = await Promise.all([
    fetchMonth(today.getFullYear(), today.getMonth() + 1),
    fetchMonth(nextDate.getFullYear(), nextDate.getMonth() + 1),
  ]);
  return [...cur, ...next];
}

async function fetchCoupons(token: string, rid?: string): Promise<CouponBenefit[]> {
  try {
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/coupon-benefits/`);
    if (rid) url.searchParams.set("restaurant_id", rid);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

/* ─── 페이지 ─────────────────────────────────────────── */
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

  const [stats, campaigns, notifications, coupons] = await Promise.all([
    fetchStats(token, rid),
    fetchCampaigns(token),
    fetchNotifications(token),
    fetchCoupons(token, rid),
  ]);

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-gray-400 text-sm">식당 정보를 불러오지 못했습니다.</p>
      </div>
    );
  }

  const ridParam = rid ? `?rid=${rid}` : "";

  return (
    <HomeContent
      stats={stats}
      campaigns={campaigns}
      notifications={notifications}
      coupons={coupons}
      ridParam={ridParam}
    />
  );
}
