import { redirect } from "next/navigation";

// 루트 접속 시 홈 또는 로그인으로 리다이렉트
export default function RootPage() {
  redirect("/dashboard");
}
