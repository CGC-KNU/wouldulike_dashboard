import { NextRequest } from "next/server";
import { proxyBody, proxyGet } from "@/lib/apiProxy";

export async function GET() {
  return proxyGet(`/api/bannerlab/figma-templates/`);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return proxyBody("POST", `/api/bannerlab/figma-templates/`, body);
}
