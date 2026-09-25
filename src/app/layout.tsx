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

/**
 * 0925: `maximumScale: 1` 과 `userScalable: false` 가 걸려 있어 **손가락으로 확대할 수 없었다.**
 * 파트너 화면을 보는 분들은 대부분 폰을 쓰시고, 40~60대가 많다. 글자가 작으면 키워서 보시는 게
 * 당연한데 그걸 막아 두고 있었다. 확대를 막는 건 보통 입력칸을 누를 때 iOS 가 제멋대로 확대하는
 * 것을 피하려고 하는데, 그건 **입력칸 글자를 16px 로 키우면 애초에 안 일어난다**(globals.css).
 *
 * `viewportFit: "cover"` 는 넣지 않는다. 기본값이면 사파리가 알아서 홈 인디케이터를 피해 준다 —
 * cover 를 켜면 고정 요소마다 여백을 직접 챙겨야 하고, 지금 그 이득이 없다.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
