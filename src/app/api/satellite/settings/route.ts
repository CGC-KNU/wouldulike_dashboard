import { NextRequest } from "next/server";
import { proxyBody, proxyGet } from "@/lib/apiProxy";

export async function GET() {
  return proxyGet("/api/satellite/settings/");
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return proxyBody("PATCH", "/api/satellite/settings/", body);
}
