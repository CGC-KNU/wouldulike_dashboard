import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireTool } from "@/lib/draft/guard";
import { readWebMetrics, type WebMetrics } from "@/lib/ga4/webMetrics";

/**
 * Probe · 웹 지표 — 우주라이크 홈(wouldulike.kr) 방문·유입·행동. GA4 Data API(lib/ga4/webMetrics.ts).
 * 성공만 캐시된다 — 실패는 throw 로 빠져나가 캐시에 남지 않는다. 방문이 아직 적어 신선도가 값보다 중요해 1시간만 캐시한다.
 */

const cached = unstable_cache(
  async (): Promise<WebMetrics> => {
    const r = await readWebMetrics();
    if (!r.ok) throw new Error(r.detail ?? r.reason);
    return r.data;
  },
  ["probe-web-v4"],
  { revalidate: 60 * 60 }
);

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  try {
    return NextResponse.json({ ok: true, ...(await cached()) });
  } catch (e) {
    console.error("[probe/web] 웹 지표 조회 실패", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "error" }, { status: 502 });
  }
}
