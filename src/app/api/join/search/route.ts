import { NextRequest, NextResponse } from "next/server";
import { API } from "@/lib/join";

/** 매장 찾기 — 백엔드 공개 검색(허블 원장, 이름 · 주소 · 업종만). 로그인 전에도 된다. */
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const q = new URLSearchParams({ campus: u.searchParams.get("campus") ?? "", q: u.searchParams.get("q") ?? "" });
  const fwd = req.headers.get("x-forwarded-for");
  const r = await fetch(`${API()}/api/partner/apply/search/?${q}`, { cache: "no-store", headers: fwd ? { "X-Forwarded-For": fwd } : {} }).catch(() => null);
  if (!r) return NextResponse.json({ stores: [], detail: "잠시 뒤 다시 찾아 주세요." }, { status: 503 });
  return NextResponse.json(await r.json().catch(() => ({ stores: [] })), { status: r.status });
}
