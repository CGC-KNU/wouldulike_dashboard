import { NextRequest } from "next/server";
import { proxyBody, proxyGet } from "@/lib/apiProxy";

export async function GET(req: NextRequest) {
  return proxyGet("/api/satellite/sponsorships/", req.nextUrl.searchParams.toString());
}

export async function POST(req: NextRequest) {
  return proxyBody("POST", "/api/satellite/sponsorships/", await req.json());
}
