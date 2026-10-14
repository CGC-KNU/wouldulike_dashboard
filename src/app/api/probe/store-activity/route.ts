import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireTool } from "@/lib/draft/guard";
import { credentialsFromEnv, readLastEventDate } from "@/lib/bigquery/appMetrics";
import { readStoreActivity, type StoreActivityData } from "@/lib/bigquery/storeActivity";

/**
 * Probe · 매장 지표의 GA4 칸(상세 열람 · 사용 실패) — 이번 달 1일(KST)부터 마지막 확정 테이블까지.
 *
 * 매장 지표 본 표(`/api/probe/overview`)와 따로 둔다. GA4 는 몇 초 걸리고 실패할 수 있는데,
 * 그 때문에 DB 칸(쿠폰 사용·스탬프)이 늦게 뜨거나 비면 안 된다. 화면은 둘을 같이 부르고 따로 채운다.
 *
 * 확정 테이블은 하루 한 번 늘어나므로 3시간 캐시한다(성공만 — 실패는 throw 로 빠져 캐시에 안 남는다).
 * 매달 1일에는 이번 달 확정 테이블이 아직 없어 `window: null` 이다 — 0 이 아니라 아직 없음.
 */

const monthStart = () => `${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7).replace("-", "")}01`;

const cached = unstable_cache(
  async (start: string): Promise<StoreActivityData | null> => {
    const last = await readLastEventDate();
    if (!last) throw new Error("확정 테이블(events_YYYYMMDD)이 없습니다");
    if (start > last) return null;
    const r = await readStoreActivity(process.env, { start, end: last });
    if (!r.ok) throw new Error(r.detail ?? r.reason);
    return r.data;
  },
  ["probe-store-activity-v1"],
  { revalidate: 3 * 60 * 60 }
);

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  if (!credentialsFromEnv()) return NextResponse.json({ ok: false, error: "GA4 키(GCP_SA_KEY)가 없습니다", window: null, stores: {} });
  try {
    const data = await cached(monthStart());
    return NextResponse.json({ ok: true, window: data?.window ?? null, stores: data?.stores ?? {} });
  } catch (e) {
    console.error("[probe/store-activity] GA4 조회 실패", e);
    return NextResponse.json({ ok: false, error: "GA4 를 읽지 못했습니다", window: null, stores: {} });
  }
}
