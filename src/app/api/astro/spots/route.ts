import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { appendDraftItem, readDraft } from "@/lib/draft/store";
import { remoteGet, remoteSend } from "@/lib/draft/remote";
import { notifyAstro } from "@/lib/slack";
import type { SpotJob } from "@/lib/draft/spot";
import { productOf } from "@/lib/draft/spot";

/**
 * 스팟 제작 목록·등록.
 *
 * 백엔드(astro 앱)가 원본이고, 아직 안 올라간 동안에는 초안 저장소로 떨어진다 —
 * 다른 Astro 화면과 같은 규칙이다.
 */

const KEY = "astro_spots";
const seed = (): SpotJob[] => [];

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const r = await remoteGet<{ spots: SpotJob[] }>("/api/astro/spots/");
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "스팟 목록을 읽지 못했습니다." }, { status: r.status });
    return NextResponse.json({ spots: r.data?.spots ?? [], draft: false });
  }
  return NextResponse.json({ spots: readDraft<SpotJob[]>(KEY, seed), draft: true });
}

export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const body = (await req.json().catch(() => ({}))) as Partial<SpotJob> & { name?: string };
  if (!body.name?.trim()) return NextResponse.json({ detail: "매장명은 필수입니다." }, { status: 400 });

  const r = await remoteSend<{ spot: SpotJob }>("POST", "/api/astro/spots/", { ...body, name: body.name.trim() });
  if (r.handled) {
    if (!r.ok) return NextResponse.json(r.data ?? { detail: "만들지 못했습니다." }, { status: r.status });
    const spot = r.data!.spot;
    await notifyAstro(`:clapper: *스팟 제작 등록* — ${spot.name}${spot.campus ? ` · ${spot.campus}` : ""}${productOf(spot.product)?.label ? ` · ${productOf(spot.product)!.label}` : ""}${spot.owner ? ` · 담당 ${spot.owner}` : ""}`);
    return NextResponse.json({ spot, draft: false }, { status: 201 });
  }

  const now = new Date().toISOString();
  const created = appendDraftItem<SpotJob>(KEY, seed, {
    name: body.name.trim(),
    campus: body.campus ?? "경북대",
    district: body.district ?? null,
    category: body.category ?? null,
    stage: body.stage ?? "컨택",
    owner: body.owner ?? null,
    product: body.product ?? null,
    price: body.price ?? null,
    list_price: productOf(body.product)?.price ?? null,
    owner_name: body.owner_name ?? null,
    contact: body.contact ?? null,
    insta: body.insta ?? null,
    map_url: body.map_url ?? null,
    restaurant_id: body.restaurant_id ?? null,
    meeting_at: body.meeting_at ?? null,
    shoot_at: body.shoot_at ?? null,
    due: body.due ?? null,
    delivered_at: body.delivered_at ?? null,
    paid_at: body.paid_at ?? null,
    plan_url: body.plan_url ?? null,
    next_action: body.next_action ?? null,
    memo: body.memo ?? null,
    last_touch_at: now,
    created_at: now,
    updated_by: null,
    updated_at: now,
  });
  return NextResponse.json({ spot: created, draft: true }, { status: 201 });
}
