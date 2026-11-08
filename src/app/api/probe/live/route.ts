import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireTool } from "@/lib/draft/guard";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { readGa4Live, type Ga4Live } from "@/lib/bigquery/liveMetrics";

/**
 * Probe · 실시간 지표 — 지금부터 24시간(민찬 1108).
 *
 * DB 칸 = 백엔드 `/api/dashboard/admin/app-stats/live/`(원장이라 바로 반영, fetchBackendJson 의 6초 캐시만).
 * GA4 칸 = BigQuery 당일분 테이블(lib/bigquery/liveMetrics.ts) — 앱 SDK 가 묶어 보내 수 분~1시간 늦게 붙으므로
 * 5분 캐시한다. 성공만 캐시된다(실패는 throw 로 빠져나간다). 한쪽을 못 읽어도 다른 쪽은 내린다 — 못 읽은 쪽은 null.
 */

export interface LiveDb {
  since: string;
  until: string;
  generated_at: string;
  stats: Record<string, number | null>;
  failed: string[];
  hourly: ({ start: string; end: string } & Record<string, number | string>)[];
  baseline: Record<string, number | null>;
  baseline_weeks: number;
  recent: { kind: string; at: string; restaurant_id: number | null; restaurant: string | null; detail: string }[];
  last_event_at: string | null;
}

const cachedGa4 = unstable_cache(
  async (): Promise<Ga4Live> => {
    const r = await readGa4Live();
    if (!r.ok) throw new Error(r.detail ?? r.reason);
    return r.data;
  },
  ["probe-live-ga4-v1"],
  { revalidate: 5 * 60 }
);

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const [db, ga4] = await Promise.all([
    fetchBackendJson<LiveDb>("/api/dashboard/admin/app-stats/live/"),
    cachedGa4().catch((e) => {
      console.error("[probe/live] GA4 조회 실패", e);
      return null;
    }),
  ]);
  return NextResponse.json({ db, ga4, generated_at: new Date().toISOString() });
}
