import type { Metadata } from "next";
import { verifyOnboardToken } from "@/lib/onboard/token";
import OnboardClient from "./OnboardClient";
import { BrandStack } from "./Brand";

/** 점주 온보딩 — 공개 경로(미들웨어). 내부 이름(Satellite)을 띄우지 않는다. */
export const metadata: Metadata = { title: { absolute: "우주라이크 파트너 등록" }, robots: { index: false, follow: false } };

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
