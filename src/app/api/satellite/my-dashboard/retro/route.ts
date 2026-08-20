import { NextRequest } from "next/server";
import { proxyBody } from "@/lib/apiProxy";

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return proxyBody("PATCH", "/api/satellite/my-dashboard/retro/", body);
}
