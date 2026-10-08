import { NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { buildInsights } from "@/lib/draft/insights";

export type { StoreInsight } from "@/lib/draft/insights";

/**
 * 이 응답은 **만드는 데 10초쯤 걸린다** (0923 실측). Papillon 3개월치 기획을 읽고, 매장 이름이
 * 들어간 게시물마다 성과를 한 번씩 더 부른다. 그동안 현황 판의 '최근 게시물'은 계속 "읽는 중…" 이다.
 *
 * 값 자체는 느리게 변한다 — 게시물 성과는 하루 단위로 움직이지 고쳐서 초 단위로 달라지지 않는다.
 * 그래서 **5분 기억한다.** 방금 본 사람이 탭을 옮겼다 돌아와도 다시 10초를 기다리지 않는다.
 * 지금 값이 꼭 필요하면 `?fresh=1`.
 */
let cached: { at: number; body: unknown } | null = null;
const TTL = 5 * 60_000;

export async function GET(req: Request) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  if (!fresh && cached && Date.now() - cached.at < TTL) {
    return NextResponse.json({ ...(cached.body as object), cached_at: new Date(cached.at).toISOString() });
  }
  const out = await buildInsights();
  if (out.papillon_reachable) cached = { at: Date.now(), body: out };
  return NextResponse.json(out);
}
