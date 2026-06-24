import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { restaurantId, pin } = await req.json();

  const cookieStore = await cookies();
  const pendingToken = cookieStore.get("pending_token")?.value;

  if (!pendingToken) {
    return NextResponse.json({ success: false, message: "세션이 만료되었습니다. 다시 로그인해주세요." }, { status: 401 });
  }

  // 백엔드에서 PIN 검증 + OwnerProfile 생성
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/auth/verify-owner/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pendingToken}`,
      },
      body: JSON.stringify({ restaurant_id: restaurantId, pin }),
    }
  );

  const data = await res.json();

  if (!res.ok || !data.success) {
    return NextResponse.json(
      { success: false, message: data.message || "PIN이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  // PIN 인증 성공 → 정식 쿠키 발급, 임시 토큰 삭제
  cookieStore.set("access_token", data.access, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  cookieStore.set("refresh_token", data.refresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90,
  });
  cookieStore.delete("pending_token");

  return NextResponse.json({ success: true });
}
