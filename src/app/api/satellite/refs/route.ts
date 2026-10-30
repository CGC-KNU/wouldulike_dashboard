import { NextRequest } from "next/server";
import { proxyBody, proxyGet } from "@/lib/apiProxy";

/** 레퍼런스 실험실(1030) — 계정 목록 · 마지막 모은 결과 · 마지막 추천. 값은 백엔드 AdminConfig papillon:refs* */
export async function GET() {
  return proxyGet("/api/satellite/refs/");
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return proxyBody("PUT", "/api/satellite/refs/", body);
}
