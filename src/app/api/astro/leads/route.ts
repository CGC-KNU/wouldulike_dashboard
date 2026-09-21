import { NextRequest, NextResponse } from "next/server";
import { appendDraftItem, readDraft, writeDraft } from "@/lib/draft/store";
import { seedLeads } from "@/lib/draft/seed";
import { LEAD_STAGES, type Lead, type LeadStage } from "@/lib/draft/types";
import { requireTool } from "@/lib/draft/guard";
import { notifyAstro } from "@/lib/slack";
import { remoteGet, remoteSend } from "@/lib/draft/remote";

/**
 * 파트너 후보(신규 컨택) 목록·등록.
 *
 * 원본은 백엔드 한 곳이다. 0921 민열님이 팀 시트를 걷어냈다 — 이제 세틀라이트·슬랙·카톡 셋만 쓴다.
 * 시트에서 씨앗을 붓던 길은 지웠다. 두 곳에서 읽으면 반드시 갈라지고, 어느 쪽이 맞는지 아무도 모르게 된다.
 * 백엔드를 못 읽으면 임시 저장소를 보여 주되 **그렇다고 화면에 적는다** — 빈 것과 못 읽은 것은 다르다.
 */

const KEY = "astro_leads";
const VALID_STAGE = new Set<string>([...LEAD_STAGES, "거절"]);

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;

  // 백엔드(Django astro 앱)가 살아 있으면 그쪽이 원본이다.
  const r = await remoteGet<{ leads: Lead[] }>("/api/astro/leads/");
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "후보를 읽지 못했습니다." }, { status: r.status });
    const leads = r.data?.leads ?? [];
    return NextResponse.json({ leads, draft: false, source: "backend" });
  }

  const backendNote = r.reason?.startsWith("backend-") || r.reason === "unreachable"
    ? "백엔드를 읽지 못해 임시 저장소를 보여 주고 있습니다. 여기서 고친 값은 오래 남지 않습니다."
    : undefined;
  const stored = readDraft<Lead[]>(KEY, seedLeads);
  return NextResponse.json({
    leads: stored,
    draft: true,
    source: "store",
    sheet_note: backendNote ?? "백엔드를 읽지 못했습니다. 후보가 없는 것이 아니라 못 읽은 것입니다.",
  });
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

  // 백엔드가 있으면 거기에 만든다. 슬랙 알림은 어느 쪽이든 여기서 보낸다.
  const r = await remoteSend<{ lead: Lead }>("POST", "/api/astro/leads/", { ...body, name: body.name.trim() });
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "후보를 만들지 못했습니다." }, { status: r.status });
    const lead = r.data!.lead;
    await notifyAstro(`:round_pushpin: *파트너 후보 등록* — ${lead.name}${lead.campus ? ` · ${lead.campus}` : ""}${lead.owner ? ` · 담당 ${lead.owner}` : ""}`);
    return NextResponse.json({ lead, draft: false }, { status: 201 });
  }

  const now = new Date().toISOString();
  const pick = (k: keyof Lead) => (body[k] as string | undefined) || null;
  const created = appendDraftItem<Lead>(KEY, seedLeads, {
    name: body.name.trim(),
    campus: (body.campus as Lead["campus"]) ?? "경북대",
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

  await notifyAstro(`:round_pushpin: *파트너 후보 등록* — ${created.name}${created.campus ? ` · ${created.campus}` : ""}${created.owner ? ` · 담당 ${created.owner}` : ""}`);

  return NextResponse.json({ lead: created, draft: true }, { status: 201 });
}
