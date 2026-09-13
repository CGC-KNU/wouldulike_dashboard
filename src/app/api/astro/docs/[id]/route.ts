import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { patchDraftItem, readDraft, writeDraft } from "@/lib/draft/store";
import { seedDocs } from "@/lib/draft/seed";
import { DOC_EDITABLE, type SalesDoc } from "@/lib/draft/types";

const KEY = "astro_docs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const b = (await req.json()) as Partial<SalesDoc> & { updated_by?: string };
  const patch: Partial<SalesDoc> = { updated_at: new Date().toISOString(), updated_by: b.updated_by ?? null };
  for (const k of DOC_EDITABLE) if (k in b) (patch as Record<string, unknown>)[k] = b[k] || null;
  if (patch.title === null) return NextResponse.json({ detail: "제목은 비울 수 없습니다." }, { status: 400 });
  const updated = patchDraftItem<SalesDoc>(KEY, seedDocs, id, patch);
  if (!updated) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ doc: updated, draft: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  writeDraft(KEY, readDraft<SalesDoc[]>(KEY, seedDocs).filter((d) => d.id !== id));
  return new NextResponse(null, { status: 204 });
}
