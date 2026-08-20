import { NextRequest } from "next/server";
import { proxyGet } from "@/lib/apiProxy";

export async function GET(req: NextRequest) {
  return proxyGet("/api/satellite/my-dashboard/", req.nextUrl.searchParams.toString());
}
