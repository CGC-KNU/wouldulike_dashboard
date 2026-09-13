import { NextRequest, NextResponse } from "next/server";
import { appendDraftItem, readDraft } from "@/lib/draft/store";
import { seedActivities } from "@/lib/draft/seed";
import type { Activity, Lead } from "@/lib/draft/types";
import { requireTool } from "@/lib/draft/guard";
import { seedLeads } from "@/lib/draft/seed";
import { patchDraftItem } from "@/lib/draft/store";

/**
 * 활동 기록 — 메모·전화·카톡·미팅·방문.
 *
 * 제휴 매장 소통이 전부 카톡이라 자동 수집이 안 된다(2026-09-09 확인). 그래서 최소한
 * "입력이 한 번의 클릭도 없이 되게" 만드는 데 집중한다. 입력기는 상시 펼쳐져 있고,
 * 여기는 그 한 줄을 받는 자리다.
 */

const KEY = "astro_activities";

export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const type = req.nextUrl.searchParams.get("target_type");
  const id = req.nextUrl.searchParams.get("target_id");
  let list = readDraft<Activity[]>(KEY, seedActivities);
  if (type && id) list = list.filter((a) => a.target_type === type && a.target_id === id);
  return NextResponse.json({ activities: list, draft: true });
}

export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const body = (await req.json()) as Partial<Activity>;
  if (!body.body?.trim() || !body.target_id) {
    return NextResponse.json({ detail: "내용과 대상이 필요합니다." }, { status: 400 });
  }
  const created = appendDraftItem<Activity>(KEY, seedActivities, {
    target_type: body.target_type ?? "store",
    target_id: String(body.target_id),
    kind: body.kind ?? "메모",
    body: body.body.trim(),
    author: body.author ?? "unknown",
    created_at: new Date().toISOString(),
  });
  // 후보에 기록을 남기면 그것도 '접촉'이다 — 방치 카운터를 되돌린다
  if (created.target_type === "lead") {
    patchDraftItem<Lead>("astro_leads", seedLeads, created.target_id, { last_touch_at: created.created_at });
  }
  return NextResponse.json({ activity: created, draft: true }, { status: 201 });
}
