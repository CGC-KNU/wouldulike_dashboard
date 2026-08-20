import { NextRequest } from "next/server";
import { proxyBody } from "@/lib/apiProxy";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return proxyBody("POST", "/api/dashboard/admin/restaurants/create/", body);
}
