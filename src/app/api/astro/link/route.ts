import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { fetchPapillonMonths, sliceForStore } from "@/lib/draft/papillon";

/**
 * 매장 한 곳의 **다른 툴 쪽 모습** — Papillon(협찬·콘텐츠) + Probe(이번 달 앱 지표).
 * 매장 상세 패널의 '연결' 블록이 이걸 읽는다. 민열님 0911: "papillon & probe 와 연계성 중요".
 *
 * GET /api/astro/link?id=12&name=라라더
 */

interface StatsEnvelope { stats?: { revisit_this_month?: number; loyal_total?: number; coupon_redeemed_this_month?: number; stamp_earned_this_month?: number } }

export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const id = Number(req.nextUrl.searchParams.get("id"));
  const name = req.nextUrl.searchParams.get("name") ?? "";
  if (!Number.isFinite(id) || !name) return NextResponse.json({ detail: "id 와 name 이 필요합니다." }, { status: 400 });

  const [pap, env] = await Promise.all([
    fetchPapillonMonths(3),
    fetchBackendJson<StatsEnvelope>("/api/dashboard/stats/", `restaurant_id=${id}`),
  ]);
  const stats = env?.stats ?? null;

  return NextResponse.json({
    store: { id, name },
    papillon: sliceForStore(pap, name),
    probe: {
      reachable: env !== null,
      stats: stats && {
        coupon_redeemed_this_month: stats.coupon_redeemed_this_month ?? 0,
        stamp_earned_this_month: stats.stamp_earned_this_month ?? 0,
        revisit_this_month: stats.revisit_this_month ?? 0,
        loyal_total: stats.loyal_total ?? 0,
      },
    },
    generated_at: new Date().toISOString(),
  });
}
