import { NextRequest, NextResponse } from "next/server";
import { appendDraftItem, readDraft } from "@/lib/draft/store";
import { seedLeads } from "@/lib/draft/seed";
import { LEAD_STAGES, type Lead, type LeadStage } from "@/lib/draft/types";
import { requireTool } from "@/lib/draft/guard";
import { sendSlackNotification } from "@/lib/slack";

/** 신규 컨택(입점 후보) 목록·등록. */

const KEY = "astro_leads";
const VALID_STAGE = new Set<string>([...LEAD_STAGES, "거절"]);

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const leads = readDraft<Lead[]>(KEY, seedLeads);
  return NextResponse.json({ leads, draft: true });
}

export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const body = (await req.json()) as Partial<Lead> & { name: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ detail: "매장명은 필수입니다." }, { status: 400 });
  }
  // 모르는 단계로 들어오면 칸반 어느 열에도 안 보이면서 KPI 에만 잡힌다 — 여기서 막는다
  if (body.stage !== undefined && !VALID_STAGE.has(body.stage)) {
    return NextResponse.json({ detail: `알 수 없는 단계입니다: ${body.stage}` }, { status: 400 });
  }

  const now = new Date().toISOString();
  const pick = (k: keyof Lead) => (body[k] as string | undefined) || null;
  const created = appendDraftItem<Lead>(KEY, seedLeads, {
    name: body.name.trim(),
    kind: (body.kind as Lead["kind"]) ?? null,
    district: pick("district"),
    category: pick("category"),
    stage: (body.stage as LeadStage | undefined) ?? "미컨택",
    owner: pick("owner"),
    intent: (body.intent as Lead["intent"]) ?? null,
    owner_name: pick("owner_name"),
    phone: pick("phone"),
    contact: pick("contact"),
    link: pick("link"),
    insta: pick("insta"),
    channel: pick("channel"),
    contacted_at: pick("contacted_at"),
    meeting_at: pick("meeting_at"),
    attendees: pick("attendees"),
    proposed_plan: pick("proposed_plan"),
    next_action: pick("next_action"),
    due: pick("due"),
    last_touch_at: body.last_touch_at ?? now,
    grade: (body.grade as Lead["grade"]) ?? null,
    score: typeof body.score === "number" ? body.score : null,
    angle: pick("angle"),
    memo: pick("memo"),
    source: "manual",
    created_at: now,
    converted_restaurant_id: null,
  });

  await sendSlackNotification(
    "SLACK_FEEDBACK_WEBHOOK_URL",
    `:round_pushpin: *신규 컨택 등록* — ${created.name}${created.owner ? ` (담당 ${created.owner})` : ""}`
  );

  return NextResponse.json({ lead: created, draft: true }, { status: 201 });
}
