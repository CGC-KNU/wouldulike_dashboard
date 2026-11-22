import { NextRequest } from "next/server";
import { proxyBody } from "@/lib/apiProxy";

/** Polaris 아이디어 메모 — 리브라 요청함에 쌓인다 */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  return proxyBody("POST", "/api/astro/polaris/inbox/", { kind: "memo", text: b.text });
}
