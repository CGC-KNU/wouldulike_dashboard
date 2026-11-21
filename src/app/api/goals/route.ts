import { proxyGet } from "@/lib/apiProxy";

/** 학기 목표(1121) — 백엔드 home:goals. 실적 · 목표 숫자라 이 저장소에 두지 않는다 */
export async function GET() {
  return proxyGet("/api/astro/goals/");
}
