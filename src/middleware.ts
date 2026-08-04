import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/", "/api/auth/"];

interface DashboardJWT {
  is_admin?: boolean;
  is_marketing?: boolean;
  role?: "SUPERADMIN" | "ADMIN" | "MARKETING";
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

  // /dashboard/admin 경로: 관리자 또는 마케팅 계정만 통과 (개발 환경 제외)
  // 마케팅은 is_admin=false 이지만 세틀라이트 탭을 봐야 하므로 is_marketing 으로 통과시킨다.
  // 실제 탭 노출은 페이지에서 role 로 필터링하고, 데이터 접근은 백엔드가 최종 판정한다.
  if (
    pathname.startsWith("/dashboard/admin") &&
    process.env.NODE_ENV !== "development"
  ) {
    try {
      const payload = parseJwtPayload(token);
      if (!payload.is_admin && !payload.is_marketing) {
        return NextResponse.redirect(new URL("/dashboard/owner", req.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // 마케팅 계정은 점주 대시보드에 들어갈 이유가 없다 (식당 데이터 접근 방지)
  if (pathname.startsWith("/dashboard/owner") && process.env.NODE_ENV !== "development") {
    try {
      const payload = parseJwtPayload(token);
      if (payload.role === "MARKETING") {
        return NextResponse.redirect(new URL("/dashboard/admin?tab=satellite", req.url));
      }
    } catch {
      // 파싱 실패는 아래 통과 — 백엔드가 최종 판정
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/).*)"],
};
