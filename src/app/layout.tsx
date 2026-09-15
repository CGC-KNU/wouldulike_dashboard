import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * 브라우저 탭 이름. 여러 툴을 탭으로 열어 두니 **어느 게 어느 건지** 보여야 한다 (민열님 0915).
 * `Satellite | 로그인` · `Satellite | 메인` · `Satellite | Astro` 꼴.
 * 점주가 보는 화면(dashboard/owner, r/[token])은 각자의 레이아웃에서 이 틀을 벗는다 —
 * 점주에게 'Satellite' 는 우리 내부 이름이라 아무 뜻이 없다.
 */
export const metadata: Metadata = {
  title: { default: "Satellite", template: "Satellite | %s" },
  description: "우주라이크 업무 시스템",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-background">{children}</body>
    </html>
  );
}
