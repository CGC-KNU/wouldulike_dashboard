import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { appendDraftItem, readDraft } from "@/lib/draft/store";
import { seedDocs } from "@/lib/draft/seed";
import { DOC_KINDS, type SalesDoc } from "@/lib/draft/types";
import { remoteGet, remoteSend } from "@/lib/draft/remote";

/**
 * 자료실 — 계약서·제안서·견적서·안내문 목록.
 * 파일 본체는 링크(드라이브/S3, 로컬은 /astro-docs/)다. 이 레포는 공개라 파일을 넣지 않는다.
 */

const KEY = "astro_docs";

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const r = await remoteGet<{ docs: SalesDoc[] }>("/api/astro/docs/");
  if (r.handled && r.ok) {
    const docs = r.data?.docs ?? [];
    // 막 올린 직후라 비어 있으면 기본 목록을 한 번 넣는다 (자료실은 시트가 아니라 시드가 원본).
    if (docs.length === 0) {
      for (const d of seedDocs()) await remoteSend("POST", "/api/astro/docs/", d);
      const again = await remoteGet<{ docs: SalesDoc[] }>("/api/astro/docs/");
      if (again.ok) return NextResponse.json({ docs: again.data?.docs ?? [], draft: false });
    }
    return NextResponse.json({ docs, draft: false });
  }
  const docs = readDraft<SalesDoc[]>(KEY, seedDocs);
  return NextResponse.json({ docs, draft: true });
}

export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const b = (await req.json()) as Partial<SalesDoc> & { updated_by?: string };
  if (!b.title?.trim()) return NextResponse.json({ detail: "제목은 필수입니다." }, { status: 400 });
  if (b.kind && !DOC_KINDS.includes(b.kind)) return NextResponse.json({ detail: "알 수 없는 종류입니다." }, { status: 400 });
  const r = await remoteSend<{ doc: SalesDoc }>("POST", "/api/astro/docs/", b);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "만들지 못했습니다." }, { status: r.status });
    return NextResponse.json({ doc: r.data!.doc, draft: false }, { status: 201 });
  }

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
