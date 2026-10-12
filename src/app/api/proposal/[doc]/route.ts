import { NextRequest, NextResponse } from "next/server";
import { proxyBody, proxyGet } from "@/lib/apiProxy";
import { requireTool, actorName } from "@/lib/draft/guard";

/** 파트너 제안서 양식 — 백엔드 `proposal:<doc>` (1012). 실적 숫자가 들어 있어 이 저장소(공개)에 두지 않는다. */
const DOCS = new Set(["6p"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ doc: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { doc } = await params;
  if (!DOCS.has(doc)) return NextResponse.json({ detail: "없는 양식입니다." }, { status: 404 });
  return proxyGet(`/api/dashboard/admin/proposal/${doc}/`);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ doc: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { doc } = await params;
  if (!DOCS.has(doc)) return NextResponse.json({ detail: "없는 양식입니다." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { data?: unknown };
  return proxyBody("PUT", `/api/dashboard/admin/proposal/${doc}/`, { data: body.data, updated_by: (await actorName()) ?? "" });
}
