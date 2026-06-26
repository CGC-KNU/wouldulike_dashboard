import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * 개발 환경 전용 — 카카오 로그인 없이 더미 쿠키로 대시보드 접근
 * GET /api/auth/dev-login?mode=owner | admin
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const mode = req.nextUrl.searchParams.get("mode") ?? "owner";

  // 서명 없는 더미 JWT (미들웨어는 존재 여부만 체크, 서명 검증 없음)
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const payload = btoa(
    JSON.stringify({
      user_id: 1,
      is_owner: true,
      is_admin: mode === "admin",
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    })
  )
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const fakeJwt = `${header}.${payload}.dev_signature`;

  const cookieStore = await cookies();
  cookieStore.set("access_token", fakeJwt, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  const dest = mode === "admin" ? "/dashboard/admin" : "/dashboard/owner";
  return NextResponse.redirect(new URL(dest, req.url));
}
