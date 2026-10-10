import { NextRequest, NextResponse } from "next/server";
import { proxyBody, proxyGet } from "@/lib/apiProxy";
import { requireTool, actorName } from "@/lib/draft/guard";

/**
 * 허블 문서 — campuses · changes · c:<key>(상권 매장) · o:<key>(팀 입력) (1010).
 * 값은 백엔드 `hubble:<key>` 에만 있다(이 저장소는 공개). 매장 원장은 관리자만, 팀 입력은 영업 권한으로 쓴다(백엔드가 막음).
 */
const KEY = /^(campuses|changes|[co]:[0-9a-f]{10})$/;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { key } = await params;
  const k = decodeURIComponent(key);
  if (!KEY.test(k)) return NextResponse.json({ detail: "없는 문서입니다." }, { status: 404 });
  return proxyGet(`/api/dashboard/admin/hubble/${k}/`);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { key } = await params;
  const k = decodeURIComponent(key);
  if (!KEY.test(k)) return NextResponse.json({ detail: "없는 문서입니다." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { data?: unknown; base_updated_at?: string | null };
  return proxyBody("PUT", `/api/dashboard/admin/hubble/${k}/`, { data: body.data, base_updated_at: body.base_updated_at ?? null, updated_by: (await actorName()) ?? "" });
}
