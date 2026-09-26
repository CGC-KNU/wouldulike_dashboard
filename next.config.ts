import type { NextConfig } from "next";

/**
 * 주소는 **app.wouldulike.kr 하나**다 (민열님 0925).
 *
 * 같은 배포에 주소가 둘 붙어 있었다 — 우리가 산 도메인과, Vercel 이 프로젝트마다 기본으로
 * 주는 `*.vercel.app`. 내용은 같지만 쿠키는 호스트 단위라 **세션이 따로 논다.** 두 주소를
 * 섞어 쓰면 "분명 로그인했는데 또 하라고 한다" 가 되고, 실제로 9/23 에 카카오 리다이렉트가
 * 한쪽으로 고정돼 있어 로그인이 깨진 적이 있다.
 *
 * 그래서 vercel.app 으로 들어오면 같은 경로 그대로 우리 도메인으로 보낸다.
 *
 * ## 307 인 이유
 * 영구(308)로 걸면 브라우저가 캐시해 버려서 되돌리기가 어렵다. 내부 도구라 검색 노출을
 * 신경 쓸 일이 없으므로 임시 전환으로 둔다 — 되돌릴 때 이 파일만 고치면 끝난다.
 *
 * ## 카카오 콜백만 빼는 이유
 * 카카오는 인가를 요청할 때 쓴 주소와 토큰을 바꿀 때 쓴 주소가 다르면 거절한다.
 * vercel.app 에서 로그인을 시작한 사람이 콜백에서 우리 도메인으로 튕기면 그 왕복이 깨진다.
 * 이미 출발한 로그인은 그대로 끝내게 두고, 그 다음 이동부터 우리 도메인으로 모은다.
 */
const CANONICAL = "https://app.wouldulike.kr";
const LEGACY_HOST = "wouldulike-dashboard.vercel.app";

/**
 * 구 주소 리다이렉트 스위치.
 *
 * 2026-09-25 밤에 한 번 껐다. 파일 업로드는 우리 서버가 아니라 S3 로 직접 나가는데
 * (presigned PUT), 그 버킷의 허용 주소 목록에 구 주소만 있고 app.wouldulike.kr 이 없어서
 * 리다이렉트를 켠 순간 업로드하는 화면 여섯 곳이 한꺼번에 막혔다. 9/26 재민 님이 버킷
 * CORS 에 새 주소와 localhost 를 넣었고, 세 주소 모두 preflight 200 을 확인한 뒤 다시 켰다.
 *
 * 교훈: 주소를 옮길 때는 그 주소가 등록된 외부 설정을 전부 같이 옮긴다 — 카카오
 * Redirect URI, S3 CORS, Koyeb 의 DASHBOARD_PUBLIC_BASE_URL. 브라우저가 우리 서버 말고
 * 직접 말을 거는 곳이 어디인지부터 센다.
 *
 * 또 막히면 이 값을 false 로 두고 배포한다. 플래그는 지우지 않는다.
 */
const REDIRECT_LEGACY_HOST = true;

const nextConfig: NextConfig = {
  images: {
    domains: ["wouldulike-bucket.s3.ap-northeast-2.amazonaws.com"],
  },
  async redirects() {
    if (!REDIRECT_LEGACY_HOST) return [];
    return [
      {
        source: "/:path((?!auth/kakao/callback).*)",
        has: [{ type: "host", value: LEGACY_HOST }],
        destination: `${CANONICAL}/:path`,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
