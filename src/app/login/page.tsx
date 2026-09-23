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

        {/*
          Apple 로그인은 뺐다 (민열님 0923).
          버튼은 `response_mode=form_post` 로 애플에 보내는데, **그 POST 를 받는 곳이 어디에도 없었다** —
          프론트에 콜백 라우트가 없고, 백엔드 `AppleLoginView` 는 Flutter 앱용이라 `identity_token` JSON 만 받는다.
          즉 도메인 문제가 아니라 웹 플로우 자체가 없었다. 눌러도 아무 데도 가지 않는 버튼을
          점주가 처음 보는 화면에 두는 것이 없는 것보다 나쁘다.
          웹 Apple 로그인이 필요해지면 콜백부터 만든다 — 버튼은 그 다음이다.
        */}

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

