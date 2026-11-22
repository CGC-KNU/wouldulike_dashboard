import { proxyBody, proxyGet } from "@/lib/apiProxy";

/** Polaris 「지금 갱신」 — GET 상태 · POST 요청(리브라가 1~2분 안에 시작) */
export async function GET() {
  return proxyGet("/api/astro/polaris/refresh/");
}
export async function POST() {
  return proxyBody("POST", "/api/astro/polaris/refresh/", {});
}
