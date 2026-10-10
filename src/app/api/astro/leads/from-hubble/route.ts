import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { notifyAstro } from "@/lib/slack";
import { remoteSend } from "@/lib/draft/remote";
import type { Lead } from "@/lib/draft/types";

/**
 * 허블 매장 → 파트너 후보 (1011). 중복 판정은 백엔드 한 곳(`/api/astro/leads/from-hubble/`)이 한다 —
 * 같은 인허가 번호는 409 blocked, 이름 · 전화가 비슷하면 409 similar. 화면은 그 답을 그대로 보여 준다.
 * 백엔드가 없으면 만들지 않는다(임시 저장소에 만들면 중복 판정을 건너뛴다).
 */
export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const body = await req.json();
  const r = await remoteSend<{ lead?: Lead; linked?: boolean }>("POST", "/api/astro/leads/from-hubble/", body);
  if (!r.handled) return NextResponse.json({ detail: "백엔드에 닿지 못해 후보를 만들지 않았습니다. 잠시 뒤 다시 시도하세요." }, { status: 503 });
  if (r.ok && r.status === 201 && r.data?.lead) {
    const l = r.data.lead;
    await notifyAstro(`:telescope: *허블에서 후보 등록* — ${l.name}${l.campus ? ` · ${l.campus}` : ""}${l.owner ? ` · 담당 ${l.owner}` : ""}`);
  }
  return NextResponse.json(r.data ?? {}, { status: r.status });
}
