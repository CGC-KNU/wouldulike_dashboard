import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/** 다른 카카오 계정으로 다시 — 신청용 토큰만 지운다. */
export async function POST() {
  (await cookies()).delete("join_token");
  return NextResponse.json({ ok: true });
}
