import type { Metadata, Viewport } from "next";

/** 검색엔진 수집 금지 — 토큰 링크는 카톡으로만 돈다. */
/** OG 이미지 절대 URL 의 기준. 운영 도메인이 바뀌면 NEXT_PUBLIC_SITE_URL 로. */
export const metadata: Metadata = { metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://wouldulike-dashboard.vercel.app"), robots: { index: false, follow: false } };
/** 루트 레이아웃은 확대를 막는다(앱 웹뷰용). 점주 페이지는 확대돼야 한다 — 40~60대가 폰으로 본다. */
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#F5F5F7] print:bg-white print:min-h-0 text-gray-900">{children}</div>;
}
