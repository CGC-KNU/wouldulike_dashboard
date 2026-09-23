import type { Metadata } from "next";
import { verifyOnboardToken } from "@/lib/onboard/token";
import OnboardClient from "./OnboardClient";
import { BrandStack } from "./Brand";

/** 점주 온보딩 — 공개 경로(미들웨어). 내부 이름(Satellite)을 띄우지 않는다. */
/**
 * 카톡으로 보내는 링크다 — **미리보기 카드가 곧 첫인상이다.**
 * 태그가 없으면 카카오가 제 기본 문구("여기를 눌러 링크를 확인하세요")를 넣고 아무 이미지나
 * 잘라 쓴다. 실제로 로고가 확대·크롭돼 글자 조각만 보였다 (0922).
 * ## noindex 를 뺀 이유 (0922)
 * 처음엔 `robots: noindex` 를 걸었다. 그랬더니 **카톡이 미리보기 카드를 아예 안 만든다** —
 * 카카오 스크래퍼는 noindex 페이지를 긁지 않는다. 링크가 벌거벗은 URL 열 줄로만 나갔다.
 *
 * 빼도 되는 이유: 이 주소는 HMAC 서명 토큰 350자라 **추측이 불가능하고**, 어디에서도 링크되지 않아
 * 크롤러가 발견할 길이 없다. 설령 발견해도 카카오 로그인과 번호 대조를 지나야 한다.
 * 반면 미리보기 카드는 사장님이 링크를 믿을지 말지를 가르는 첫인상이다 — 그쪽이 훨씬 크다.
 * (서명한 계약서 사본 `/contract` 은 개인정보가 들어가므로 거기 noindex 는 그대로 둔다.)
 */
/**
 * 미리보기 문구. **주장도 시간 약속도 넣지 않는다** (민열님 0923: "너무 사기꾼같음 → 정직하고 심플하게").
 * "5분이면 끝납니다" 는 광고 배너 문법이고, 계약 서명을 앞둔 화면의 첫인상으로는 정반대였다.
 * 이미지(`/brand/og-onboard.jpg`, 생성기는 같은 폴더의 `og-onboard.source.html`)와 같은 톤으로 맞춘다.
 */
const OG_DESC = "계약서 확인과 혜택 등록을 하실 수 있습니다.";
export const metadata: Metadata = {
  title: { absolute: "우주라이크 파트너 등록" },
  description: OG_DESC,
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
