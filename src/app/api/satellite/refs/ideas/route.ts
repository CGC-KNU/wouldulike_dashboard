import { NextRequest } from "next/server";
import { proxyBody } from "@/lib/apiProxy";

export const maxDuration = 60;   // AI 추천 한 번

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return proxyBody("POST", "/api/satellite/refs/ideas/", body);
}
