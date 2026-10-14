import { NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { fetchBackendJson } from "@/lib/draft/toolProxy";

/**
 * Probe · 인스타 **계정 도달** 7일과 그 4주 전 7일 — 메인 Polaris 성장률 「인스타 도달 (7일)」 줄.
 *
 * 백엔드 `/api/probe/insights/reach/` 가 Meta 에 계정 단위로 묻는다(게시물별 reach 를 더하면 같은 사람을 여러 번 센다).
 * 창은 KST 날짜, 끝은 그저께 — Meta 인사이트가 최대 48시간 늦게 찬다. `reach` null 은 Meta 가 값을 안 준 것(0 아님).
 */

export interface ReachWindow { from: string; to: string; reach: number | null }
export interface ReachPayload { now: ReachWindow; ago: ReachWindow; compare_days: number; lag_days: number }

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;

  const data = await fetchBackendJson<ReachPayload>("/api/probe/insights/reach/");
  if (!data?.now) {
    // 0 으로 내려보내면 "도달 0"으로 읽힌다 — 못 읽었다고 말한다
    return NextResponse.json({ detail: "인스타 도달을 읽지 못했습니다." }, { status: 503 });
  }
  return NextResponse.json(data);
}
