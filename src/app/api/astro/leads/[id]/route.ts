import { NextRequest, NextResponse } from "next/server";
import { patchDraftItem, readDraft, writeDraft } from "@/lib/draft/store";
import { seedLeads } from "@/lib/draft/seed";
import { LEAD_EDITABLE, LEAD_STAGES, type Lead } from "@/lib/draft/types";
import { requireTool } from "@/lib/draft/guard";
import { sendSlackNotification } from "@/lib/slack";

const KEY = "astro_leads";
const VALID_STAGE = new Set<string>([...LEAD_STAGES, "거절"]);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const body = (await req.json()) as Partial<Lead>;
  if (body.stage !== undefined && !VALID_STAGE.has(body.stage)) {
    return NextResponse.json({ detail: `알 수 없는 단계입니다: ${body.stage}` }, { status: 400 });
  }

  const before = readDraft<Lead[]>(KEY, seedLeads).find((l) => l.id === id) ?? null;

  // 허용 필드만 — id·created_at·converted_restaurant_id 는 클라이언트가 못 바꾼다
  const patch: Partial<Lead> = {};
  for (const k of LEAD_EDITABLE) {
    if (k in body) (patch as Record<string, unknown>)[k] = body[k];
  }
  // 단계를 옮기는 것 자체가 "접촉"이다 — 방치 감지 기준을 여기서 갱신한다.
  if (body.stage && body.stage !== before?.stage) patch.last_touch_at = new Date().toISOString();

  const updated = patchDraftItem<Lead>(KEY, seedLeads, id, patch);
  if (!updated) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });

  if (before && body.stage && body.stage !== before.stage) {
    await sendSlackNotification(
      "SLACK_FEEDBACK_WEBHOOK_URL",
      `:arrow_right: *${updated.name}* — ${before.stage} → ${updated.stage}`
    );
  }

  return NextResponse.json({ lead: updated, draft: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const list = readDraft<Lead[]>(KEY, seedLeads);
  writeDraft(
    KEY,
    list.filter((l) => l.id !== id)
  );
  return new NextResponse(null, { status: 204 });
}
