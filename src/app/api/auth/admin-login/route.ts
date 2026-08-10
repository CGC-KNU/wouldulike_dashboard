import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * 2단계 로그인의 2단계 — 공용 관리자 아이디/비번.
 *
 * 신원(kakao_id)은 1단계 카카오 로그인이 심어둔 httpOnly 쿠키에서 읽는다.
 * 클라이언트가 보낸 값을 쓰지 않는 이유 — 그러면 아무 kakao_id 나 넣어
 * 다른 사람 직무로 로그인할 수 있게 된다.
 */
export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json(
      { success: false, message: "아이디와 비밀번호를 입력해주세요." },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const pendingKakaoId = cookieStore.get("pending_kakao_id")?.value;

  if (!pendingKakaoId) {
    return NextResponse.json(
      {
        success: false,
        requiresKakao: true,
        message: "카카오 로그인을 먼저 완료해주세요.",
      },
      { status: 401 }
    );
  }

  const backendRes = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/auth/admin-login/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, kakao_id: pendingKakaoId }),
    }
  );

  if (!backendRes.ok) {
    const errBody = await backendRes.json().catch(() => ({}));
    return NextResponse.json(
      {
        success: false,
        message: errBody.message || "로그인에 실패했습니다.",
        requiresKakao: !!errBody.requires_kakao,
      },
      { status: backendRes.status }
    );
  }

  const body = await backendRes.json();
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
  // 관문을 통과했으니 대기 상태는 정리한다
  cookieStore.delete("pending_kakao_id");

  return NextResponse.json({
    success: true,
    department: body.department,
    department_label: body.department_label,
    display_name: body.display_name,
  });
}
