import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireTool } from "@/lib/draft/guard";
import { readCastorHealth } from "@/lib/bigquery/castor";

/**
 * Castor · 이벤트 감시 + 흐름(퍼널 3개). GA4 확정 테이블은 하루 한 번 늘어나므로 6시간 캐시.
 * 키가 없거나 실패하면 캐시하지 않고 이유를 그대로 내려 화면이 "연결 전"으로 보이게 한다.
 */
const cached = unstable_cache(() => readCastorHealth(), ["castor-health-v1"], { revalidate: 6 * 3600 });

export async function GET() {
  const deny = await requireTool("admin");
  if (deny) return deny;
  try {
    const h = await cached();
    return NextResponse.json(h);
  } catch (e) {
    return NextResponse.json({ ok: false, reason: `BigQuery 조회 실패: ${(e as Error).message.slice(0, 200)}`, through: null, window: null, events: [], screen_views: [], user_id_share: null, flows: [] });
  }
}
