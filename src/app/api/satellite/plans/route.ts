import { NextRequest } from "next/server";
import { proxyBody, proxyGet } from "@/lib/apiProxy";

export async function GET(req: NextRequest) {
  return proxyGet("/api/satellite/plans/", req.nextUrl.searchParams.toString());
}

export async function POST(req: NextRequest) {
  return proxyBody("POST", "/api/satellite/plans/", await req.json());
}
