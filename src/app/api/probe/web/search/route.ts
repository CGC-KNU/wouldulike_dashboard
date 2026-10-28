import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireTool } from "@/lib/draft/guard";
import { readSearchConsole, type SearchConsoleData } from "@/lib/gsc/searchConsole";

/**
 * Probe · 웹 지표 — 구글 검색(Search Console, lib/gsc/searchConsole.ts).
 * 웹 지표(/api/probe/web)와 따로 둔다 — 한쪽이 실패해도 다른 쪽 카드는 보인다.
 * Search Console 은 하루 단위로 늦게 들어와 6시간 캐시한다. 성공만 캐시된다.
 */

const cached = unstable_cache(
  async (): Promise<SearchConsoleData> => {
    const r = await readSearchConsole();
    if (!r.ok) throw new Error(r.detail ?? r.reason);
    return r.data;
  },
  ["probe-web-search-v1"],
  { revalidate: 6 * 60 * 60 }
);

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  try {
    return NextResponse.json({ ok: true, ...(await cached()) });
  } catch (e) {
    console.error("[probe/web/search] Search Console 조회 실패", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "error" }, { status: 502 });
  }
}
