import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { patchDraftItem, readDraft, writeDraft } from "@/lib/draft/store";
import { remoteGet, remoteSend } from "@/lib/draft/remote";
import { notifyAstro } from "@/lib/slack";
import { SPOT_EDITABLE, spotAmount, type SpotJob } from "@/lib/draft/spot";

const KEY = "astro_spots";
const seed = (): SpotJob[] => [];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Partial<SpotJob>;

  const list = await remoteGet<{ spots: SpotJob[] }>("/api/astro/spots/");
  if (list.handled && list.ok) {
    const prev = (list.data?.spots ?? []).find((x) => x.id === id) ?? null;
    const r = await remoteSend<{ spot: SpotJob }>("PATCH", `/api/astro/spots/${id}/`, body);
    if (r.handled) {
      if (!r.ok) return NextResponse.json(r.data ?? { detail: "저장하지 못했습니다." }, { status: r.status });
      const spot = r.data!.spot;
      // 단계가 움직였을 때만 알린다. 메모 잔손질까지 보내면 채널이 시끄러워져 아무도 안 본다.
      if (prev && body.stage && body.stage !== prev.stage) {
        const won = spotAmount(spot);
        await notifyAstro(`:clapper: *${spot.name}* — ${prev.stage} → ${spot.stage}${won ? ` · ${won.toLocaleString()}원` : ""}${spot.owner ? ` · ${spot.owner}` : ""}`);
      }
      return NextResponse.json({ spot, draft: false });
    }
  }

  const patch: Partial<SpotJob> = {};
  for (const k of SPOT_EDITABLE) if (k in body) (patch as Record<string, unknown>)[k] = body[k];
  patch.updated_at = new Date().toISOString();
  const updated = patchDraftItem<SpotJob>(KEY, seed, id, patch);
  if (!updated) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ spot: updated, draft: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { id } = await ctx.params;
  const r = await remoteSend("DELETE", `/api/astro/spots/${id}/`);
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "지우지 못했습니다." }, { status: r.status });
    return new NextResponse(null, { status: 204 });
  }
  writeDraft(KEY, readDraft<SpotJob[]>(KEY, seed).filter((x) => x.id !== id));
  return new NextResponse(null, { status: 204 });
}
