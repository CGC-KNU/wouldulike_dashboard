import { NextRequest, NextResponse } from "next/server";
import { appendDraftItem, readDraft, writeDraft } from "@/lib/draft/store";
import { seedLeads } from "@/lib/draft/seed";
import { LEAD_STAGES, type Lead, type LeadStage } from "@/lib/draft/types";
import { requireTool } from "@/lib/draft/guard";
import { fetchTab, normName, rowToLead } from "@/lib/draft/sheet";
import { SALES_SHEET } from "@/lib/satellite";
import { notifyAstro } from "@/lib/slack";

/**
 * 파트너 후보(신규 컨택) 목록·등록.
 *
 * 0913 민열님: "파트너 후보는 원래 시트 기준으로 불러와줘."
 * 저장소가 비어 있으면 **팀 세일즈 시트의 '신규'·'후보' 탭을 읽어 그대로 목록을 만든다**(`sheetLeads`).
 * 사람이 툴에서 고친 값이 이미 있으면 시트를 읽지 않는다 — 툴이 원본인 칸을 시트 빈 칸이 덮으면 안 되기 때문이다.
 * 시트를 못 읽으면 빈 목록 + `sheet_error` 로 돌려준다. 빈 것과 '못 읽음'을 화면이 구분하게.
 */

const KEY = "astro_leads";
const VALID_STAGE = new Set<string>([...LEAD_STAGES, "거절"]);

/** 팀 시트 '신규' + '후보(영남대)' + '후보계명(계명대)' → 후보 목록. 같은 매장은 뒤 탭이 이긴다. */
async function sheetLeads(): Promise<{ leads: Lead[]; error: boolean }> {
  const now = new Date().toISOString();
  const [nw, cand, kmu] = await Promise.all([
    fetchTab(SALES_SHEET.tabs.신규),
    fetchTab(SALES_SHEET.tabs.후보),
    fetchTab(SALES_SHEET.tabs.후보계명),
  ]);
  if (nw === null && cand === null && kmu === null) return { leads: [], error: true };
  const byName = new Map<string, Lead>();
  for (const [rows, src] of [[nw ?? [], "sheet:신규"], [cand ?? [], "sheet:후보"], [kmu ?? [], "sheet:후보계명"]] as const) {
    for (const r of rows) {
      const lead = rowToLead(r, src as Lead["source"], now);
      if (lead) byName.set(normName(lead.name), lead);
    }
  }
  return { leads: [...byName.values()], error: false };
}

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const stored = readDraft<Lead[]>(KEY, seedLeads);
  if (stored.length > 0) return NextResponse.json({ leads: stored, draft: true, source: "store" });

  // 비어 있으면 시트가 원본이다
  const { leads, error } = await sheetLeads();
  if (leads.length > 0) {
    try { writeDraft(KEY, leads); } catch { /* 읽기 전용 저장소면 이번 응답에만 쓴다 */ }
  }
  return NextResponse.json({
    leads,
    draft: true,
    source: error ? "sheet_error" : "sheet",
    sheet_note: error ? "팀 시트를 읽지 못했습니다. 비어 있는 것이 아니라 못 읽은 것입니다 — 시트 공개 설정을 확인하세요." : undefined,
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
