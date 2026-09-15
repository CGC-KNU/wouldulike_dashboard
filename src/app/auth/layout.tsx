import type { Metadata } from "next";

/** 관리자·점주 로그인, PIN 확인, 카카오 콜백, 미리보기 — 전부 '들어가는 중'이다. */
export const metadata: Metadata = { title: "로그인" };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
