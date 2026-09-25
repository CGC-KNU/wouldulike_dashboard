import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { decodeJwt } from "@/lib/jwt";
import AdminViewBanner from "@/components/DevModeBanner";
import { ViewModeProvider } from "@/contexts/ViewModeContext";
import OwnerNavWrapper from "@/components/OwnerNavWrapper";

/** 점주가 보는 화면. 내부 이름(Satellite)을 띄우지 않는다. */
export const metadata: Metadata = { title: { absolute: "우주라이크 점주 대시보드" } };

export default async function OwnerLayout({
  children,
  params: _params,
}: {
  children: React.ReactNode;
  params: Promise<Record<string, string>>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value ?? "";

  let isAdmin = false;
  try {
    const payload = decodeJwt<{ is_admin?: boolean }>(token);
    isAdmin = !!payload.is_admin;
  } catch {
    // 파싱 실패 무시
  }

  return (
    <ViewModeProvider>
      <div className="min-h-screen bg-background">
        {/* 관리자일 때만. 진짜 사장님 화면에는 머리가 없다 — 폰에서 세로 한 줄이 아깝고,
            자기 가게 이름은 첫 화면이 이미 크게 말해 준다. */}
        {isAdmin && (
          <Suspense fallback={<div className="h-14 bg-[#050072]" />}>
            <AdminViewBanner />
          </Suspense>
        )}
        <OwnerNavWrapper hasHeader={isAdmin}>{children}</OwnerNavWrapper>
      </div>
    </ViewModeProvider>
  );
}
