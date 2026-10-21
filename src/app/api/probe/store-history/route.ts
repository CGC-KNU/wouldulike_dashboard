import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { fetchBackendResult } from "@/lib/draft/toolProxy";

/**
 * Probe · 매장 하나의 월별 기록 — 매장 패널의 월별 막대 · 계약 기간 누적(1022).
 * 백엔드가 매일 굳히는 월별 스냅샷(굳은 달만)을 그대로 준다. 이번 달은 매장 지표 표가 맡는다.
 * 행이 없는 달은 0 이 아니라 「굳기 전」이다 — 화면이 그렇게 적는다.
 */
export interface StoreMonth {
  period: string; complete: boolean; counted_at: string;
  coupon_redeemed: number; stamp_earned: number; revisit: number; loyal_total: number; wishlist_count: number;
  coupon_users: number | null; active_users: number | null; voucher_redeemed: number | null; mileage_earners: number | null;
}

export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const rid = req.nextUrl.searchParams.get("rid") ?? "";
  if (!/^\d+$/.test(rid)) return NextResponse.json({ detail: "rid 가 필요합니다." }, { status: 400 });
  const r = await fetchBackendResult<{ months?: StoreMonth[] }>("/api/dashboard/admin/metric-snapshots/", `restaurant=${rid}`);
  if (!r.data?.months) return NextResponse.json({ detail: "월별 기록을 읽지 못했습니다." }, { status: 503 });
  return NextResponse.json({ months: r.data.months });
}
