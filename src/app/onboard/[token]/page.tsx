import type { Metadata } from "next";
import { verifyOnboardToken } from "@/lib/onboard/token";
import OnboardClient from "./OnboardClient";
import { BrandStack } from "./Brand";

/** 점주 온보딩 — 공개 경로(미들웨어). 내부 이름(Satellite)을 띄우지 않는다. */
/**
 * 카톡으로 보내는 링크다 — **미리보기 카드가 곧 첫인상이다.**
 * 태그가 없으면 카카오가 제 기본 문구("여기를 눌러 링크를 확인하세요")를 넣고 아무 이미지나
 * 잘라 쓴다. 실제로 로고가 확대·크롭돼 글자 조각만 보였다 (0922).
 * 검색 노출은 계속 막는다(robots) — 링크를 받은 사람만 볼 문서다.
 */
const OG_DESC = "카카오 로그인 후 5분이면 계약과 혜택 등록이 끝납니다. 중간에 나가셔도 이어서 하실 수 있습니다.";
export const metadata: Metadata = {
  title: { absolute: "우주라이크 파트너 등록" },
  description: OG_DESC,
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "우주라이크",
    title: "우주라이크 파트너 등록",
    description: OG_DESC,
    locale: "ko_KR",
    images: [{ url: "/brand/og-onboard.jpg", width: 1200, height: 630, alt: "우주라이크 파트너 등록" }],
  },
};

export default async function OnboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = verifyOnboardToken(token);
  if (!v.ok) {
    const msg = v.reason === "만료" ? "이 링크는 기한이 지났습니다. 담당자에게 새 링크를 요청해 주세요." : "유효하지 않은 링크입니다. 카카오톡으로 받으신 주소를 다시 확인해 주세요.";
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <BrandStack size={52} className="mb-4" />
          <p className="text-[15px] text-gray-800 leading-relaxed">{msg}</p>
        </div>
      </main>
    );
  }
  return <OnboardClient token={token} />;
}
