import { NextRequest, NextResponse } from "next/server";
import { API } from "@/lib/join";

/** 학교 찾기 — 전국 4년제(허블 대학 목록). 세 상권 밖 매장도 신청할 수 있게(1026 민열님). */
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const r = await fetch(`${API()}/api/partner/apply/campuses/?${new URLSearchParams({ q })}`, { cache: "no-store" }).catch(() => null);
  if (!r) return NextResponse.json({ campuses: [] }, { status: 503 });
  return NextResponse.json(await r.json().catch(() => ({ campuses: [] })), { status: r.status });
}
