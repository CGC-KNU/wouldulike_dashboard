import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/** 세티 놀이방 — 지금 상태·내 남은 횟수·팀원 순위. 원본은 백엔드 한 곳(팀이 같이 키우는 세티라 브라우저에 두면 안 된다). */
export async function GET() {
  const token = (await cookies()).get("access_token")?.value ?? "";
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/satty/`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const raw = await res.text();
    try { return NextResponse.json(JSON.parse(raw), { status: res.status }); }
    catch { return NextResponse.json({ detail: `서버 오류 (${res.status})` }, { status: res.status >= 400 ? res.status : 502 }); }
  } catch {
    return NextResponse.json({ detail: "세티한테 못 닿았어요." }, { status: 502 });
  }
}
