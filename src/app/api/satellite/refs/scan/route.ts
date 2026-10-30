import { proxyBody } from "@/lib/apiProxy";

export const maxDuration = 60;   // 계정 30개 × 인스타 조회

export async function POST() {
  return proxyBody("POST", "/api/satellite/refs/scan/", {});
}
