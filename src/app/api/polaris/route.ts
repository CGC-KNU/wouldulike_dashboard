import { proxyGet } from "@/lib/apiProxy";

/** Polaris 방향 지도(1122) — 리브라가 올린 화면 틀 + 데이터(백엔드 AdminConfig polaris:map). 관리자만 */
export async function GET() {
  return proxyGet("/api/astro/polaris/");
}
