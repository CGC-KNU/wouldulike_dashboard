import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/", "/api/auth/"];

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

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/).*)"],
};
