/**
 * 앱 → 웹 자동 로그인
 * Flutter 앱이 웹뷰 열 때 ?token=<jwt> 파라미터로 접근
 * 이 엔드포인트에서 토큰 검증 후 쿠키 발급
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { token } = await req.json();

  if (!token) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  // 백엔드에서 토큰 검증 + 점주 여부 확인
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/auth/app-token/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }
  );

  const data = await res.json();

  if (!res.ok || !data.is_owner) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set("access_token", data.access, {
    httpOnly: true,
    secure: true,
    sameSite: "none", // 웹뷰 크로스사이트 허용
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ success: true });
}
