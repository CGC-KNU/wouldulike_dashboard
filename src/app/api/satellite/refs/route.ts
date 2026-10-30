import { NextRequest } from "next/server";
import { proxyBody, proxyGet } from "@/lib/apiProxy";

/** 레퍼런스 실험실(1030) — 자동으로 모은 계정 풀 · 마지막 결과 · 분석 · 추천 / POST {exclude} 계정 빼기. 값은 백엔드 AdminConfig papillon:ref* */
export async function GET() {
  return proxyGet("/api/satellite/refs/");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return proxyBody("POST", "/api/satellite/refs/", body);
}
