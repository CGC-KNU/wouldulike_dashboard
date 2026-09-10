import { NextRequest, NextResponse } from "next/server";
import { patchDraftItem, readDraft, writeDraft } from "@/lib/draft/store";
import { seedStoreOps } from "@/lib/draft/seed";
import { STORE_OPS_EDITABLE, emptyStoreOps, type StoreOps } from "@/lib/draft/types";
import { requireTool } from "@/lib/draft/guard";

/** 매장 운영 필드 조회·수정. 수정자와 시각을 반드시 같이 남긴다 (시트가 못 남기던 것). */

const KEY = "astro_store_ops";

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const list = readDraft<StoreOps[]>(KEY, seedStoreOps);
  const found = list.find((o) => String(o.id) === id) ?? null;
  return NextResponse.json({ ops: found ? { ...emptyStoreOps(found.id), ...found } : null, draft: true });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const rid = parseId(id);
  if (rid === null) return NextResponse.json({ detail: "잘못된 매장 id 입니다." }, { status: 400 });

  const body = (await req.json()) as Partial<StoreOps> & { updated_by?: string };

  // 허용 필드만 받는다 — id·billing_checked_by 같은 걸 클라이언트가 덮어쓰면
  // "누가 확인했는지를 못 박는다"는 이 화면의 존재 이유가 우회된다.
  const stamped: Partial<StoreOps> = { updated_at: new Date().toISOString(), updated_by: body.updated_by ?? "unknown" };
  for (const k of STORE_OPS_EDITABLE) {
    if (k in body) (stamped as Record<string, unknown>)[k] = body[k];
  }

  // 입금을 "확인"으로 바꾸는 순간, 누가 언제 확인했는지를 같이 못 박는다.
  if (body.billing === "PAID" && !body.billing_checked_at) {
    stamped.billing_checked_at = new Date().toISOString().slice(0, 10);
    stamped.billing_checked_by = body.updated_by ?? "unknown";
  }

  const updated = patchDraftItem<StoreOps>(KEY, seedStoreOps, id, stamped);
  if (updated) return NextResponse.json({ ops: updated, draft: true });

  // 아직 운영 행이 없는 매장 — 이 시점에 만든다
  const list = readDraft<StoreOps[]>(KEY, seedStoreOps);
  const created: StoreOps = { ...emptyStoreOps(rid), ...stamped };
  writeDraft(KEY, [...list, created]);
  return NextResponse.json({ ops: created, draft: true });
}
