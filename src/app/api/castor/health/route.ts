import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireTool } from "@/lib/draft/guard";
import { readCastorHealth } from "@/lib/bigquery/castor";

/**
 * Castor · 이벤트 감시 + 흐름. GA4 확정 테이블은 하루 한 번 늘어나므로 6시간 캐시(기간별 따로).
 * ?days=1|7|28 — 오늘(마지막 확정일) · 이번 주 · 이번 달. 실패하면 캐시하지 않고 이유를 그대로 내린다.
 */
const cached = (days: number) => unstable_cache(() => readCastorHealth(days), [`castor-health-v2-${days}`], { revalidate: 6 * 3600 })();

export async function GET(req: NextRequest) {
  const deny = await requireTool("admin");
  if (deny) return deny;
  const d = Number(req.nextUrl.searchParams.get("days") ?? 7);
  const days = [1, 7, 28].includes(d) ? d : 7;
  try {
    return NextResponse.json(await cached(days));
  } catch (e) {
    return NextResponse.json({ ok: false, reason: `BigQuery 조회 실패: ${(e as Error).message.slice(0, 200)}`, through: null, window: null, days, events: [], screen_views: [], user_id_share: null, flows: [], fail_reasons: [], redeem_lag: [], weekly: [] });
  }
}
