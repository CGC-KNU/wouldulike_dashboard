import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { code } = await req.json();

  if (!code) {
    return NextResponse.json({ success: false, message: "code missing" }, { status: 400 });
  }

  // 1. Kakao code → access_token 교환
  const kakaoTokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.KAKAO_REST_API_KEY!,
      redirect_uri: process.env.KAKAO_REDIRECT_URI!,
      code,
    }),
  });

  if (!kakaoTokenRes.ok) {
    const errBody = await kakaoTokenRes.text();
    console.error("[kakao/route] token exchange failed:", errBody);
    return NextResponse.json(
      { success: false, message: "카카오 토큰 교환 실패" },
      { status: 401 }
    );
  }

  const { access_token: kakaoAccessToken } = await kakaoTokenRes.json();

  // 2. 백엔드에 access_token 전달 → 우리 JWT 발급
  const backendRes = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/auth/kakao`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: kakaoAccessToken }),
    }
  );

  if (!backendRes.ok) {
    const errBody = await backendRes.text();
    console.error("[kakao/route] backend login failed:", errBody);
    return NextResponse.json({ success: false, message: "카카오 로그인 실패" }, { status: 401 });
  }

  const body = await backendRes.json();
  const access: string = body.token?.access ?? body.access;
  const refresh: string = body.token?.refresh ?? body.refresh;
  const is_owner: boolean = body.is_owner ?? false;

  // 3. 기존 점주 계정 → 쿠키 세팅
  if (is_owner) {
    const cookieStore = await cookies();
    cookieStore.set("access_token", access, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    cookieStore.set("refresh_token", refresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 90,
    });
    return NextResponse.json({ success: true });
  }

  // 4. 신규 / 미인증 → 임시 토큰 세팅 후 PIN 인증 유도
  const cookieStore = await cookies();
  cookieStore.set("pending_token", access, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 30,
  });

  return NextResponse.json({ success: false, requiresPinVerification: true });
}
