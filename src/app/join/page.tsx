import type { Metadata } from "next";
import { Suspense } from "react";
import Script from "next/script";
import JoinClient from "./JoinClient";

/**
 * 공용 입점 신청 — 공개 경로(미들웨어 PUBLIC_JOIN). DM · QR · 인스타 어디서 눌러도 여기로(`?src=dm|qr|insta`).
 * 미리보기 문구는 주장 없이 정직하게(0923 민열님 「사기꾼같음」 피드백 그대로 따른다).
 */
const DESC = "매장 확인 · 혜택 · 약관 동의까지 이 화면에서 신청하실 수 있습니다.";
export const metadata: Metadata = {
  title: { absolute: "우주라이크 파트너 입점 신청" },
  description: DESC,
  openGraph: { type: "website", siteName: "우주라이크", title: "우주라이크 파트너 입점 신청", description: DESC, locale: "ko_KR",
    images: [{ url: "/brand/og-onboard-0923.jpg", width: 1200, height: 630, alt: "우주라이크 파트너" }] },
};

export default function JoinPage() {
  // 측정(1027) — 홈(wouldulike.kr)과 같은 GA4 · 네이버 · Clarity. 신청 화면에만 붙인다(관리 화면엔 안 씀)
  return (
    <>
      <Script src="https://www.googletagmanager.com/gtag/js?id=G-R4EE9LLPKP" strategy="afterInteractive" />
      <Script id="ga4" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-R4EE9LLPKP',{linker:{domains:['wouldulike.kr','app.wouldulike.kr']}});`}</Script>
      <Script src="https://wcs.pstatic.net/wcslog.js" strategy="afterInteractive" />
      <Script id="wcs" strategy="afterInteractive">{`(function t(){if(!window.wcs){return setTimeout(t,300)}window.wcs_add=window.wcs_add||{};wcs_add["wa"]="1cc11b3335254c0";wcs_do();})();`}</Script>
      <Script id="clarity" strategy="afterInteractive">{`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","z41ty2r4w3");`}</Script>
      <Suspense><JoinClient /></Suspense>
    </>
  );
}
