import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { readQrScans } from "@/lib/ga4/qrScans";

/**
 * Probe · 매장 QR 의 GA4 칸 — 하루 한도 · 로그인 전에 끝난 스캔 · 웹 화면만 연 손님 (lib/ga4/qrScans.ts).
 *
 * GET ?start=YYYY-MM-DD&end=YYYY-MM-DD → 어제(한국)까지로 잘라 센다. DB 칸(/api/probe/qr)과 따로 읽어
 * 한쪽이 늦거나 실패해도 다른 쪽은 보인다.
 */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 62;

export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const start = req.nextUrl.searchParams.get("start") ?? "";
  const end = req.nextUrl.searchParams.get("end") ?? "";
  if (!DAY_RE.test(start) || !DAY_RE.test(end)) return NextResponse.json({ detail: "start · end 는 YYYY-MM-DD 입니다." }, { status: 400 });
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
  if (!(days >= 1 && days <= MAX_DAYS)) return NextResponse.json({ detail: `기간은 1~${MAX_DAYS}일입니다.` }, { status: 400 });
  return NextResponse.json(await readQrScans(process.env, { start, end }));
}
