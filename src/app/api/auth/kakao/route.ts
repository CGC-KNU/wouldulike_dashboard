import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { code } = await req.json();

  if (!code) {
    return NextResponse.json({ success: false, message: "code missing" }, { status: 400 });
  }

  // 1. 백엔드에 카카오 코드 전달 → JWT 발급
  const backendRes = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/auth/kakao`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }
  );

  if (!backendRes.ok) {
    return NextResponse.json({ success: false, message: "카카오 로그인 실패" }, { status: 401 });
  }

  const { access, refresh, is_owner } = await backendRes.json();

  // 2. 기존 점주 계정이면 쿠키 세팅 후 대시보드로
  if (is_owner) {
    const cookieStore = await cookies();
    cookieStore.set("access_token", access, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30일
    });
    cookieStore.set("refresh_token", refresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 90, // 90일
    });
    return NextResponse.json({ success: true });
  }

  // 3. 처음 접속 → PIN 인증 필요. 임시 토큰만 세팅
  const cookieStore = await cookies();
  cookieStore.set("pending_token", access, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 30, // 30분
  });

  return NextResponse.json({ success: false, requiresPinVerification: true });
}
