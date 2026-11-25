import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { fetchBackendResult } from "@/lib/draft/toolProxy";

/**
 * Probe · 매장 QR — QR(스티커·스탠드)로 온 손님이 앱·웹 중 어디서 무엇을 했나 (1125).
 *
 * GET ?start=YYYY-MM-DD&end=YYYY-MM-DD → 백엔드 /api/probe/qr-path/ 그대로.
 * 세는 법(멱등 키로 앱·웹 가르기 · 웹 표시는 11/25 부터 · 지워진 QR 쿠폰 합치기)은 백엔드 probe/qr_path.py.
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
  const { status, data } = await fetchBackendResult<Record<string, unknown>>("/api/probe/qr-path/", q.toString() || undefined);
  if (!data) return NextResponse.json({ detail: status === 400 ? "기간이 맞지 않습니다." : "백엔드에서 매장 QR 숫자를 읽지 못했습니다." }, { status: status || 502 });
  return NextResponse.json(data);
}
