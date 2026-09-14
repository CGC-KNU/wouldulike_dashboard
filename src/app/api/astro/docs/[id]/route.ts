import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { patchDraftItem, readDraft, writeDraft } from "@/lib/draft/store";
import { seedDocs } from "@/lib/draft/seed";
import { DOC_EDITABLE, type SalesDoc } from "@/lib/draft/types";
import { remoteSend } from "@/lib/draft/remote";

const KEY = "astro_docs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const b = (await req.json()) as Partial<SalesDoc> & { updated_by?: string };
  const patch: Partial<SalesDoc> = { updated_at: new Date().toISOString(), updated_by: b.updated_by ?? null };
  for (const k of DOC_EDITABLE) if (k in b) (patch as Record<string, unknown>)[k] = b[k] || null;
  if (patch.title === null) return NextResponse.json({ detail: "제목은 비울 수 없습니다." }, { status: 400 });
  const r = await remoteSend<{ doc: SalesDoc }>("PATCH", `/api/astro/docs/${id}/`, b);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "저장하지 못했습니다." }, { status: r.status });
    return NextResponse.json({ doc: r.data!.doc, draft: false });
  }

  const updated = patchDraftItem<SalesDoc>(KEY, seedDocs, id, patch);
  if (!updated) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ doc: updated, draft: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const r = await remoteSend("DELETE", `/api/astro/docs/${id}/`);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "지우지 못했습니다." }, { status: r.status });
    return new NextResponse(null, { status: 204 });
  }
  writeDraft(KEY, readDraft<SalesDoc[]>(KEY, seedDocs).filter((d) => d.id !== id));
  return new NextResponse(null, { status: 204 });
}
