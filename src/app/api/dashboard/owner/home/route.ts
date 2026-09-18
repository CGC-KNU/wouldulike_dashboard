import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * 파트너 홈 원자료 — 백엔드 /api/astro/partner/home/ 를 그대로 넘긴다.
 * 점주 토큰이면 자기 매장, 관리자면 ?rid 로 보는 매장. 무슨 일이 있어도 JSON 을 돌려준다.
 */
export async function GET(req: NextRequest) {
  const token = (await cookies()).get("access_token")?.value ?? "";
  const rid = req.nextUrl.searchParams.get("rid");
  const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/astro/partner/home/`);
  if (rid) url.searchParams.set("restaurant_id", rid);
  try {
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const raw = await res.text();
    try { return NextResponse.json(JSON.parse(raw), { status: res.status }); }
    catch { return NextResponse.json({ detail: `서버 오류 (${res.status})` }, { status: res.status >= 400 ? res.status : 502 }); }
  } catch {
    return NextResponse.json({ detail: "백엔드에 연결하지 못했습니다." }, { status: 502 });
  }
}
