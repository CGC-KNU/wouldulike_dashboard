import type { MetadataRoute } from "next";

/**
 * 웹 앱 설치 정보 (1008). 크롬 · 엣지에서 [앱 설치]를 누르면 세틀라이트가 주소창 없는 창 앱으로 깔린다 —
 * 윈도우 팀원도 맥 데스크톱 앱과 같은 화면을 독 · 작업 표시줄 아이콘으로 쓴다. 화면은 웹과 같은 코드라 배포가 곧 업데이트.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "세틀라이트",
    short_name: "세틀라이트",
    description: "우주라이크 업무 시스템",
    id: "/dashboard/admin",
    start_url: "/dashboard/admin",
    scope: "/",
    display: "standalone",
    background_color: "#050072",
    theme_color: "#050072",
    lang: "ko",
    icons: [
      { src: "/icons/satellite-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/satellite-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
