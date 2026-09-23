/**
 * 로그인 뒤 **가려던 곳으로** 돌려보낸다.
 *
 * 미들웨어가 `/login` 으로 보낼 때 원래 주소를 `post_login_to` 쿠키에 담아 둔다(middleware.ts `toLogin`).
 * 로그인이 끝나는 자리는 넷이다 — 카카오 콜백 · 관리자 2단계 · PIN 인증 · 앱 로그인.
 * 네 곳이 각자 `/dashboard` 로 보내고 있어서 슬랙 딥링크가 전부 첫 화면으로 떨어졌다.
 *
 * ⚠️ 쿠키 값은 사용자가 만들 수 있다. **내부 경로인지 반드시 검사한다** —
 * `//evil.com` 이나 `https://…` 를 그대로 넘기면 우리 도메인에서 남의 사이트로 튕기는 열린 리다이렉트가 된다.
 * 그래서 `/` 로 시작하고 `//` 가 아니며 `/dashboard` 아래인 것만 받는다.
 */
export function takePostLoginPath(): string {
  const fallback = "/dashboard";
  try {
    const raw = document.cookie.split("; ").find((c) => c.startsWith("post_login_to="));
    // 한 번 쓰고 버린다 — 남겨 두면 다음 로그인이 엉뚱한 데로 간다
    document.cookie = "post_login_to=; Max-Age=0; path=/";
    if (!raw) return fallback;
    const v = decodeURIComponent(raw.slice("post_login_to=".length));
    if (!v.startsWith("/") || v.startsWith("//")) return fallback;
    if (!v.startsWith("/dashboard")) return fallback;
    return v;
  } catch {
    return fallback;
  }
}
