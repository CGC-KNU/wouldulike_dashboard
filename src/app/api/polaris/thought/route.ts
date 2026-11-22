import { NextRequest } from "next/server";
import { proxyBody } from "@/lib/apiProxy";

/** Polaris 「내 생각」 — 리브라 요청함(polaris:inbox)에 쌓이고 1~2분 안에 리브라가 가져가 반영 */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  return proxyBody("POST", "/api/astro/polaris/inbox/", { kind: "thought", text: b.text, to: b.to });
}
