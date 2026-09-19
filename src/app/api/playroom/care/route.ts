import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/** 밥 주기·놀아 주기·씻기기·재우기·대화. 상한을 넘으면 백엔드가 429 로 돌려보낸다 — 화면은 그걸 그대로 말한다. */
export async function POST(req: NextRequest) {
  const token = (await cookies()).get("access_token")?.value ?? "";
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/satty/care/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const raw = await res.text();
    try { return NextResponse.json(JSON.parse(raw), { status: res.status }); }
    catch { return NextResponse.json({ detail: `서버 오류 (${res.status})` }, { status: res.status >= 400 ? res.status : 502 }); }
  } catch {
    return NextResponse.json({ detail: "세티한테 못 닿았어요." }, { status: 502 });
  }
}
