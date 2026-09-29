import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { proxyBody } from "@/lib/apiProxy";

/** 관리자: 매장 PIN 비우기 (0929 임시 PIN 정리). ?rid=&force=1 */
export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const rid = Number(req.nextUrl.searchParams.get("rid"));
  if (!Number.isFinite(rid) || rid <= 0) return NextResponse.json({ detail: "rid 가 필요합니다." }, { status: 400 });
  const force = req.nextUrl.searchParams.get("force") === "1" ? "&force=1" : "";
  return proxyBody("POST", `/api/dashboard/auth/clear-pin/?restaurant_id=${rid}${force}`, {});
}
