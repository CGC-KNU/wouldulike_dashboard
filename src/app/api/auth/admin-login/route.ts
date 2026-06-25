import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json(
      { success: false, message: "아이디와 비밀번호를 입력해주세요." },
      { status: 400 }
    );
  }

  const backendRes = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/auth/admin-login/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }
  );

  if (!backendRes.ok) {
    const errBody = await backendRes.json().catch(() => ({}));
    return NextResponse.json(
      { success: false, message: errBody.message || "로그인에 실패했습니다." },
      { status: 401 }
    );
  }

  const body = await backendRes.json();
  const cookieStore = await cookies();
  const isProd = process.env.NODE_ENV === "production";

  cookieStore.set("access_token", body.access, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  cookieStore.set("refresh_token", body.refresh, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90,
  });

  return NextResponse.json({ success: true });
}
