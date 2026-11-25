import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { fetchBackendResult } from "@/lib/draft/toolProxy";

/**
 * Probe · 신규 유입 — 기간 안 새 가입자를 대학가별로 + 계명대 프로모션 쿠폰 (1125).
 *
 * GET ?start=YYYY-MM-DD&end=YYYY-MM-DD → 백엔드 /api/probe/signup-inflow/ 그대로.
 * 세는 법(대학가는 지금 프로필 값 · 테스트 계정 제외 · 지워진 프로모션 쿠폰 합치기)은 백엔드 probe/signup_inflow.py.
 */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const q = new URLSearchParams();
  for (const k of ["start", "end"] as const) {
    const v = req.nextUrl.searchParams.get(k);
    if (!v) continue;
    if (!DAY_RE.test(v)) return NextResponse.json({ detail: `${k} 는 YYYY-MM-DD 입니다.` }, { status: 400 });
    q.set(k, v);
  }
  const { status, data } = await fetchBackendResult<Record<string, unknown>>("/api/probe/signup-inflow/", q.toString() || undefined);
  if (!data) return NextResponse.json({ detail: status === 400 ? "기간이 맞지 않습니다." : "백엔드에서 신규 유입을 읽지 못했습니다." }, { status: status || 502 });
  return NextResponse.json(data);
}
