"use client";

export default function LoginPage() {
  /**
   * 카카오로 돌아올 주소는 **지금 열려 있는 도메인**이어야 한다.
   *
   * 환경변수(`NEXT_PUBLIC_KAKAO_REDIRECT_URI`)에 `vercel.app` 으로 고정돼 있어서,
   * `app.wouldulike.kr` 에서 로그인해도 카카오가 `vercel.app` 으로 돌려보냈다 — 로그인 도중
   * 도메인이 바뀌니 세션 쿠키도, 가려던 주소를 담아 둔 쿠키도 다른 호스트에 남아 못 읽는다.
   * 슬랙 딥링크가 첫 화면으로 떨어진 진짜 이유다 (0923 실측).
   * 카카오 콘솔에 두 주소가 모두 등록돼 있으므로 현재 origin 을 쓰는 것이 맞다.
   */
  const handleKakaoLogin = () => {
    const kakaoClientId = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;

    // 미들웨어가 주소(`?next=`)와 쿠키 둘 다에 가려던 곳을 담아 준다. 쿠키가 지워진 브라우저라도
    // 주소는 남아 있으니 여기서 쿠키를 다시 세운다 — 카카오에 다녀오면 `?next=` 는 사라진다.
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next.startsWith("/dashboard") && !next.startsWith("//")) {
      document.cookie = `post_login_to=${encodeURIComponent(next)}; path=/; max-age=1800; samesite=lax`;
    }

    const redirectUri = `${window.location.origin}/auth/kakao/callback`;
    window.location.href = `https://kauth.kakao.com/oauth/authorize?client_id=${kakaoClientId}&redirect_uri=${redirectUri}&response_type=code&scope=profile_nickname`;
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      {/* 로고 */}
      <div className="mb-10 text-center">
        <h1 className="text-2xl font-bold text-navy">우주라이크</h1>
        <p className="mt-1 text-sm text-gray-500">점주 대시보드</p>
      </div>

      {/* 로그인 카드 */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8 flex flex-col gap-4">
        <p className="text-center text-gray-700 font-medium mb-2">
          사용 중인 계정으로 로그인하세요
        </p>

        {/* 카카오 로그인 */}
        <button
          onClick={handleKakaoLogin}
          className="w-full flex items-center justify-center gap-3 bg-[#FEE500] text-[#1A1A1A] font-semibold py-3 px-4 rounded-xl hover:bg-yellow-300 transition-colors"
        >
          <KakaoIcon />
          카카오로 로그인
        </button>

        {/* Apple 로그인 (iOS 전용) */}
        <AppleLoginButton />

        <p className="text-center text-xs text-gray-400 mt-2">
          점주로 등록된 계정만 이용할 수 있습니다
        </p>
      </div>

    </main>
  );
}

function KakaoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 2C5.582 2 2 4.896 2 8.444c0 2.26 1.493 4.247 3.75 5.374l-.957 3.573c-.084.314.284.566.552.38L9.63 15.18c.12.01.24.016.37.016 4.418 0 8-2.896 8-6.444S14.418 2 10 2z"
        fill="#1A1A1A"
      />
    </svg>
  );
}

function AppleLoginButton() {
  // iOS 환경에서만 표시
  const isIOS =
    typeof window !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (!isIOS) return null;

  const handleAppleLogin = () => {
    const clientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI;
    window.location.href = `https://appleid.apple.com/auth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code id_token&scope=name email&response_mode=form_post`;
  };

  return (
    <button
      onClick={handleAppleLogin}
      className="w-full flex items-center justify-center gap-3 bg-black text-white font-semibold py-3 px-4 rounded-xl hover:bg-gray-900 transition-colors"
    >
      <AppleIcon />
      Apple로 로그인
    </button>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
      <path
        d="M14.94 11.39c-.02-2.03 1.66-3.01 1.73-3.06-0.94-1.38-2.41-1.57-2.93-1.59-1.25-.13-2.44.74-3.07.74-.63 0-1.6-.72-2.63-.7-1.35.02-2.6.79-3.29 2-1.41 2.44-.36 6.05 1.01 8.03.67.97 1.46 2.06 2.5 2.02 1.01-.04 1.39-.65 2.61-.65 1.22 0 1.56.65 2.62.63 1.08-.02 1.76-0.98 2.42-1.95.77-1.12 1.08-2.2 1.1-2.26-.02-.01-2.11-.81-2.13-3.22zm-2-5.9c.56-.67.93-1.6.83-2.53-.8.03-1.77.53-2.34 1.19-.51.59-.96 1.55-.84 2.46.89.07 1.79-.45 2.35-1.12z"
        fill="white"
      />
    </svg>
  );
}
