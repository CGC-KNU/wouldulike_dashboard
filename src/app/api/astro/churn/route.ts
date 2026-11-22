import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { isChurnReason, recordChurn } from "@/lib/finance/churn";

/** 해지 사유 기록 — 매장 상세의 계약 종료가 제휴를 끈 뒤 부른다(행에서 끄는 종료는 end-contract 라우트가 같이 남긴다). */
export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const b = (await req.json().catch(() => ({}))) as { restaurant_id?: unknown; reason?: unknown };
  const rid = Number(b.restaurant_id);
  if (!Number.isInteger(rid)) return NextResponse.json({ detail: "매장 번호가 아닙니다." }, { status: 400 });
  if (!isChurnReason(b.reason)) return NextResponse.json({ detail: "해지 사유를 고르세요." }, { status: 400 });
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const ok = await recordChurn(rid, b.reason, today);
  return ok ? NextResponse.json({ ok: true }, { status: 201 }) : NextResponse.json({ detail: "해지 사유를 남기지 못했습니다." }, { status: 502 });
}
