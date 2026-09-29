import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { proxyBody, proxyGet } from "@/lib/apiProxy";

/** 관리자: 매장에 붙은 점주 계정 보기(GET ?rid=) · 떼기(POST {id}) — 0929 이층 사고 정리용 */
export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const rid = req.nextUrl.searchParams.get("rid");
  if (!rid) return NextResponse.json({ detail: "rid 가 필요합니다." }, { status: 400 });
  return proxyGet("/api/dashboard/admin/owner-profiles/", `restaurant_id=${encodeURIComponent(rid)}`);
}

export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = (await req.json().catch(() => ({}))) as { id?: number };
  if (!id) return NextResponse.json({ detail: "id 가 필요합니다." }, { status: 400 });
  return proxyBody("POST", "/api/dashboard/admin/owner-profiles/", { id, action: "deactivate" });
}
