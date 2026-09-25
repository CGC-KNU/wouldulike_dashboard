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

const nextConfig: NextConfig = {
  images: {
    domains: ["wouldulike-bucket.s3.ap-northeast-2.amazonaws.com"],
  },
  async redirects() {
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
