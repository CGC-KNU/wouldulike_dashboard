import { NextRequest } from "next/server";
import { proxyGet } from "@/lib/apiProxy";

export async function GET(req: NextRequest) {
  return proxyGet("/api/satellite/location/search/", req.nextUrl.searchParams.toString());
}
