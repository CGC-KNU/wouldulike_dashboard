import type { Metadata } from "next";
import { Suspense } from "react";
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
  return <Suspense><JoinClient /></Suspense>;
}
