import { proxyGet } from "@/lib/apiProxy";

/** 메인 「마케팅」 칸(1121) — 우리 팔로워 · 성장률 · F&B 동향 다섯 · 뜨는 계정 셋. 무거운 refs 전체 대신 추린 것 */
export async function GET() {
  return proxyGet("/api/satellite/refs/summary/");
}
