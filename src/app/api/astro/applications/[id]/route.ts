import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { remoteSend } from "@/lib/draft/remote";

/**
 * 입점 신청 처리 — { action: "approve" | "reject" | "duplicate", note?, restaurant_id?, force? }
 * 승인은 백엔드가 매장 · 플랜 · 운영값 · PIN · 혜택 · 점주 · 후보 · 동의 기록을 한 번에 만들고, 실패하면 거꾸로 지운다.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ detail: "신청 번호가 이상합니다." }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const r = await remoteSend<unknown>("POST", `/api/partner/admin/applications/${id}/decide/`, body);
  if (!r.handled) return NextResponse.json({ detail: "백엔드에 닿지 않습니다." }, { status: 503 });
  return NextResponse.json(r.data ?? {}, { status: r.ok ? 200 : r.status || 502 });
}
