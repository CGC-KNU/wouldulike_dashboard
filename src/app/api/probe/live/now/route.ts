import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireTool } from "@/lib/draft/guard";
import { readGa4Now } from "@/lib/ga4/realtime";
import type { Ga4Now } from "@/lib/ga4/realtimeShape";

/**
 * Probe · 실시간 지표의 「지금」 칸 — GA4 실시간 API, 최근 30분을 5분 칸으로(민찬 1109).
 *
 * 24시간 칸(/api/probe/live, BigQuery · 5분 캐시)과 따로 둔다 — 이쪽은 1분마다 새로 본다.
 * 1분 캐시로 여러 사람이 탭을 열어도 GA4 토큰(프로젝트 시간당 한도)을 한 번만 쓴다. 성공만 캐시된다.
 */

const cachedNow = unstable_cache(
  async (): Promise<Ga4Now> => {
    const r = await readGa4Now();
    if (!r.ok) throw new Error(r.detail ?? r.reason);
    return r.data;
  },
  ["probe-live-now-v1"],
  { revalidate: 60 }
);

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const now = await cachedNow().catch((e) => {
    console.error("[probe/live/now] GA4 실시간 조회 실패", e);
    return null;
  });
  return NextResponse.json({ now, generated_at: new Date().toISOString() });
}
