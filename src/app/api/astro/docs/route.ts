import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { appendDraftItem, readDraft } from "@/lib/draft/store";
import { seedDocs } from "@/lib/draft/seed";
import { DOC_KINDS, type SalesDoc } from "@/lib/draft/types";

/**
 * 자료실 — 계약서·제안서·견적서·안내문 목록.
 * 파일 본체는 링크(드라이브/S3, 로컬은 /astro-docs/)다. 이 레포는 공개라 파일을 넣지 않는다.
 */

const KEY = "astro_docs";

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const docs = readDraft<SalesDoc[]>(KEY, seedDocs);
  return NextResponse.json({ docs, draft: true });
}

export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const b = (await req.json()) as Partial<SalesDoc> & { updated_by?: string };
  if (!b.title?.trim()) return NextResponse.json({ detail: "제목은 필수입니다." }, { status: 400 });
  if (b.kind && !DOC_KINDS.includes(b.kind)) return NextResponse.json({ detail: "알 수 없는 종류입니다." }, { status: 400 });
  const created = appendDraftItem<SalesDoc>(KEY, seedDocs, {
    kind: b.kind ?? "기타",
    title: b.title.trim(),
    version: b.version || null,
    url: b.url || null,
    when: b.when || null,
    note: b.note || null,
    updated_at: new Date().toISOString(),
    updated_by: b.updated_by ?? null,
  });
  return NextResponse.json({ doc: created, draft: true }, { status: 201 });
}
