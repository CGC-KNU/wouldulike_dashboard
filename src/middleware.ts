import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/", "/api/auth/"];
// 점주가 로그인 없이 여는 리포트 링크 — 접두어가 아니라 **정확한 모양**만 연다 (40자 hex, 또는 담당자 미리보기는 쿠키가 있어야 하므로 여기 없음).
const PUBLIC_EXACT = [/^\/r\/[0-9a-f]{40}$/, /^\/api\/r\/[0-9a-f]{40}\/view$/];
// 점주 온보딩 — 서명 토큰(base64url.base64url)만 연다. 세션은 라우트 안에서 만든다 (lib/onboard/token.ts).
// v1(점 있음)·v2(점 없음) 두 모양 다 연다 — lib/onboard/token.ts ONBOARD_TOKEN_RE 와 같은 규칙
const ONBOARD_TOKEN = "(?:[A-Za-z0-9_-]{40,600}\\.[A-Za-z0-9_-]{43}|[A-Za-z0-9_-]{60,700})";
// `/contract` 은 서명한 계약서 사본을 앱이 직접 그려 주는 자리다 (0922).
// 드라이브가 HTML 을 소스 그대로 펼쳐 보여서 점주가 "이상한 코드"를 받았다.
const PUBLIC_ONBOARD = [new RegExp(`^/onboard/${ONBOARD_TOKEN}(/contract)?$`), new RegExp(`^/api/onboard/${ONBOARD_TOKEN}(/(session|consent|complete|sms|pin))?$`)];

interface DashboardJWT {
  is_admin?: boolean;
  is_marketing?: boolean;
  department?: "SUPERADMIN" | "ADMIN" | "MARKETING" | "SALES";
}

/** Edge Runtime에서 사용 가능한 인라인 JWT 디코더 (서명 검증 없음) */
function parseJwtPayload(token: string): DashboardJWT {
  const [, payload] = token.split(".");
  if (!payload) throw new Error("Invalid JWT");
  // atob is available in Edge runtime
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json) as DashboardJWT;
}

/**
 * 로그인으로 보내면서 **가려던 곳을 들고 간다.**
 *
 * 슬랙 알림의 딥링크(`?tab=probe-reports&plan=123`)를 로그아웃 상태로 열면 `/login` 으로 갔다가
 * 로그인 뒤 `/dashboard` 로만 떨어졌다 — tab·plan 이 사라져 "그냥 메인 페이지만 뜬다" (0923 실측).
 * 알림을 보고 누르는 사람은 대개 로그아웃 상태라(슬랙 인앱 브라우저) 사실상 딥링크가 안 되고 있었다.
 *
 * 쿠키에 담는 이유: 카카오 로그인이 외부로 한 번 나갔다 오므로 주소만으로는 못 들고 간다.
 * 비밀이 아니라 경로일 뿐이라 httpOnly 로 두지 않는다 — 대신 **쓰는 쪽에서 내부 경로인지 반드시 검사한다**
 * (`//evil.com` 같은 값이 들어오면 열린 리다이렉트가 된다).
 */
function toLogin(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  // 문서 이동만 기억한다. API·정적 요청까지 담으면 마지막에 실패한 fetch 주소로 끌려간다.
  const wantsHtml = (req.headers.get("accept") ?? "").includes("text/html");
  const want = wantsHtml && pathname.startsWith("/dashboard") ? pathname + search : null;

  const url = new URL("/login", req.url);
  // **주소와 쿠키 둘 다에 담는다.** 카카오 로그인이 외부로 나갔다 오는 사이에 쿠키가 없어지는
  // 경우가 있다(브라우저가 바뀌거나, 인앱 브라우저에서 외부 브라우저로 넘어가거나).
  // 주소는 그 왕복을 못 견디고, 쿠키는 브라우저 전환을 못 견딘다 — 하나만으로는 새는 길이 남는다.
  if (want) url.searchParams.set("next", want);
  const res = NextResponse.redirect(url);
  if (want) res.cookies.set("post_login_to", want, { sameSite: "lax", maxAge: 60 * 30, path: "/" });
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 온보딩 화면 리허설용 토큰 발급 — **개발 서버에서만.** 운영 빌드에서는 이 줄이 통하지 않고
  // 라우트 자체도 404 를 낸다. 서명만 하는 길이라 매장 PIN 을 건드리지 않는다 (0924).
  if (process.env.NODE_ENV === "development" && pathname === "/api/onboard/dev-token") {
    return NextResponse.next();
  }

  // 공개 경로는 통과
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || PUBLIC_EXACT.some((re) => re.test(pathname)) || PUBLIC_ONBOARD.some((re) => re.test(pathname))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("access_token")?.value;

  // Castor 파서(CI)는 쿠키가 없다. 이 한 경로만 라우트 안에서 X-Castor-Token 으로 판정한다.
  if (!token && pathname === "/api/castor/graph" && req.method === "POST" && req.headers.has("x-castor-token")) {
    return NextResponse.next();
  }

  if (!token) {
    // 앱 → 웹 자동로그인: ?token= 파라미터 있으면 처리 페이지로
    const appToken = req.nextUrl.searchParams.get("token");
    if (appToken) {
      const url = req.nextUrl.clone();
      url.pathname = "/auth/app-login";
      return NextResponse.redirect(url);
    }
    return toLogin(req);
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
      return toLogin(req);
    }
  }

  // 식당 API 권한이 없는 직무는 점주 대시보드에 들어갈 이유가 없다
  if (pathname.startsWith("/dashboard/owner") && process.env.NODE_ENV !== "development") {
    try {
      const payload = parseJwtPayload(token);
      if (payload.is_marketing && !payload.is_admin) {
        return NextResponse.redirect(new URL("/dashboard/admin?tab=satellite", req.url));
      }
    } catch {
      // 파싱 실패는 아래 통과 — 백엔드가 최종 판정
    }
  }

  return NextResponse.next();
}

export const config = {
  // brand/ · fonts/ 는 로고와 브랜드 서체다. 점주 온보딩은 **로그인 없이** 여는 화면이라
  // 여기서 막히면 로고 자리에 깨진 이미지가 뜨고 제목이 시스템 폰트로 떨어진다 (0921).
  // 공개해도 되는 자산만 뺀다 — astro-docs·bannerlab·campus·satellite 는 그대로 보호한다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|brand/|fonts/).*)"],
};
