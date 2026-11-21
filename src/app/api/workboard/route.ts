import { proxyGet } from "@/lib/apiProxy";

/** 업무 대시보드(1121) — 백엔드 `/api/astro/workboard/`(AdminConfig home:workboard). 칸은 리브라가 채우고 화면은 읽기만 */
export async function GET() {
  return proxyGet("/api/astro/workboard/");
}
