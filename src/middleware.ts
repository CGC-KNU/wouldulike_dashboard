import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/", "/api/auth/"];

interface DashboardJWT {
  is_admin?: boolean;
}

/** Edge Runtime에서 사용 가능한 인라인 JWT 디코더 (서명 검증 없음) */
function parseJwtPayload(token: string): DashboardJWT {
  const [, payload] = token.split(".");
  if (!payload) throw new Error("Invalid JWT");
  // atob is available in Edge runtime
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json) as DashboardJWT;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 공개 경로는 통과
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("access_token")?.value;

  if (!token) {
    // 앱 → 웹 자동로그인: ?token= 파라미터 있으면 처리 페이지로
    const appToken = req.nextUrl.searchParams.get("token");
    if (appToken) {
      const url = req.nextUrl.clone();
      url.pathname = "/auth/app-login";
      return NextResponse.redirect(url);
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // /dashboard/admin 경로: is_admin 클레임 필수 (개발 환경 제외)
  if (
    pathname.startsWith("/dashboard/admin") &&
    process.env.NODE_ENV !== "development"
  ) {
    try {
      const payload = parseJwtPayload(token);
      if (!payload.is_admin) {
        return NextResponse.redirect(new URL("/dashboard/owner", req.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/).*)"],
};
