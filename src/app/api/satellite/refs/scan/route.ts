import { proxyBody } from "@/lib/apiProxy";

export const maxDuration = 60;   // 후보 25개 확인 + 계정 40개 모으기 + AI 분석(보통 40초 안)

export async function POST() {
  return proxyBody("POST", "/api/satellite/refs/scan/", {});
}
