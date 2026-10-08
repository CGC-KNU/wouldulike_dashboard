import { NextRequest, NextResponse } from "next/server";
import { proxyBody, proxyGet } from "@/lib/apiProxy";
import { requireTool, actorName } from "@/lib/draft/guard";

/**
 * Castor 문서 — 앱 지도 · 화면 메모 · 계측 정의서 · 변경 보드 · 단계 체크리스트 (1008).
 * 값은 백엔드 `castor:<doc>` 에만 있다(이 저장소는 공개). 동시 수정은 base_updated_at 로 백엔드가 409 를 낸다.
 */
const DOCS = new Set(["app_graph", "screens", "events", "changes", "roadmap", "player", "refs", "research", "experiments"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ doc: string }> }) {
  const deny = await requireTool("admin");
  if (deny) return deny;
  const { doc } = await params;
  if (!DOCS.has(doc)) return NextResponse.json({ detail: "없는 문서입니다." }, { status: 404 });
  return proxyGet(`/api/dashboard/admin/castor/${doc}/`);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ doc: string }> }) {
  const deny = await requireTool("admin");
  if (deny) return deny;
  const { doc } = await params;
  if (!DOCS.has(doc)) return NextResponse.json({ detail: "없는 문서입니다." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { data?: unknown; base_updated_at?: string | null };
  return proxyBody("PUT", `/api/dashboard/admin/castor/${doc}/`, { data: body.data, base_updated_at: body.base_updated_at ?? null, updated_by: (await actorName()) ?? "" });
}
