import { NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { remoteGet } from "@/lib/draft/remote";
import type { CampaignWeek } from "@/lib/draft/campaigns";

/** 알림이 나갈 준비가 됐는지 — 관리자에게만 온다. 채널 ID 는 비밀이 아니고, 토큰 값은 담기지 않는다. */
export interface CampaignReady {
  slack_token: boolean;
  /** 알림 표가 있는가 = 마이그레이션이 돌았는가 */
  alerts_table: boolean;
  channel: Record<string, string>;
  mileage_channel_set: boolean;
  sent: string[];
}

/**
 * 캠페인 주간(마일리지 2배 · 한정쿠폰) — 고정 일정.
 *
 * 원본은 백엔드 `astro/campaigns.py` 다. 못 읽으면 **빈 목록**을 준다 — 지어내지 않는다.
 * 달력에 안 뜨는 건 금방 알아채지만, 틀린 날짜가 떠 있으면 아무도 의심하지 않는다.
 */
export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const r = await remoteGet<{ campaigns: CampaignWeek[]; ready?: CampaignReady }>("/api/astro/campaigns/");
  if (r.handled && r.ok && r.data) {
    return NextResponse.json({ campaigns: r.data.campaigns ?? [], ready: r.data.ready ?? null });
  }
  return NextResponse.json({ campaigns: [], ready: null });
}
