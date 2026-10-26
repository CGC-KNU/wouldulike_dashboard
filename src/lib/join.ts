/**
 * 공용 입점 신청 (1026, 명세 CGC/04_사내툴_개발/1026_공용_입점페이지/명세서.md) — 서버 라우트가 같이 쓰는 것.
 * 사장님 카카오 앱 토큰은 httpOnly 쿠키 `join_token` 에만 있다(api/auth/kakao 가 join 플래그로 심는다).
 */
import { cookies } from "next/headers";
import { decodeJwt } from "@/lib/jwt";

export const API = () => process.env.NEXT_PUBLIC_API_URL ?? "";

export async function joinToken(): Promise<string | null> {
  const t = (await cookies()).get("join_token")?.value;
  if (!t) return null;
  try {
    const j = decodeJwt<{ exp?: number }>(t);
    if (j.exp && j.exp * 1000 < Date.now()) return null;
  } catch {
    return null;
  }
  return t;
}
