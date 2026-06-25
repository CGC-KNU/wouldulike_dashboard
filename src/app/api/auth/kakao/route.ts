import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { code } = await req.json();

  if (!code) {
    return NextResponse.json({ success: false, message: "code missing" }, { status: 400 });
  }

  // 백엔드에 code 직접 전달 → 백엔드에서 token exchange + user 조회
  const backendRes = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/auth/kakao`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }
  );

  if (!backendRes.ok) {
    const errBody = await backendRes.text();
    console.error("[kakao/route] backend login failed:", errBody);
    return NextResponse.json(
      { success: false, message: "카카오 로그인 실패" },
      { status: 401 }
    );
  }

  const body = await backendRes.json();
  const access: string = body.token?.access ?? body.access;
  const refresh: string = body.token?.refresh ?? body.refresh;
  const is_owner: boolean = body.is_owner ?? false;

  const cookieStore = await cookies();

  if (is_owner) {
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

  // 신규 / 미인증 → pending_token 세팅 후 PIN 인증 유도
  cookieStore.set("pending_token", access, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 30,
  });

  return NextResponse.json({ success: false, requiresPinVerification: true });
}
