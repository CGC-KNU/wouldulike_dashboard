import { NextRequest, NextResponse } from "next/server";
import { requireFinance } from "@/lib/draft/guard";
import { remoteSend } from "@/lib/draft/remote";
import { checkSettings } from "@/lib/finance/validate";

/**
 * 재무 · 설정 — 영업 시간 단가(원/시간, 기본 1만). CAC 의 사람 시간 몫을 이 값으로 돈으로 바꾼다.
 * 원본은 백엔드 AdminConfig `finance:settings`. 백엔드가 없는 환경에서는 저장하지 않는다(재무 숫자를 임시 저장소에 두지 않는다).
 */
export async function PUT(req: NextRequest) {
  const deny = await requireFinance();
  if (deny) return deny;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = checkSettings(body);
  if (!checked.ok) return NextResponse.json({ detail: checked.detail }, { status: 400 });
  const r = await remoteSend<{ doc: { hour_rate: number } }>("PUT", "/api/finance/docs/settings/", checked.value);
  if (!r.handled) return NextResponse.json({ detail: "백엔드 재무 원장이 없어 저장하지 못했습니다." }, { status: 503 });
  if (!r.ok) return NextResponse.json(r.data ?? { detail: "저장하지 못했습니다." }, { status: r.status });
  return NextResponse.json(r.data);
}
