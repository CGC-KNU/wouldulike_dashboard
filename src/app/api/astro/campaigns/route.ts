import { NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { remoteGet } from "@/lib/draft/remote";
import type { CampaignWeek } from "@/lib/draft/campaigns";

/**
 * 캠페인 주간(마일리지 2배 · 한정쿠폰) — 고정 일정.
 *
 * 원본은 백엔드 `astro/campaigns.py` 다. 못 읽으면 **빈 목록**을 준다 — 지어내지 않는다.
 * 달력에 안 뜨는 건 금방 알아채지만, 틀린 날짜가 떠 있으면 아무도 의심하지 않는다.
 */
export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const r = await remoteGet<{ campaigns: CampaignWeek[] }>("/api/astro/campaigns/");
  return NextResponse.json({ campaigns: (r.handled && r.ok && r.data?.campaigns) || [] });
}
