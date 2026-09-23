import { NextRequest, NextResponse } from "next/server";
import { actorName, requireTool } from "@/lib/draft/guard";
import { backendUrl, getAccessToken, proxyBody } from "@/lib/apiProxy";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { remoteGet } from "@/lib/draft/remote";
import type { BackendRestaurant, StoreOps } from "@/lib/draft/types";
import { notifyAstro } from "@/lib/slack";

/**
 * 한정 쿠폰 승인 — **사장님이 적었다고 그대로 캠페인에 나가지 않는다.**
 *
 * 한정 쿠폰은 학생회 채널로 매달 나가는 자리다. 편성은 우리가 상권 밸런스를 보고 정하고,
 * 그 전에 내용도 봐야 한다 — 문구가 캠페인에 맞는지, 조건이 과하거나 모호하지 않은지.
 * 그래서 온보딩은 `active:false` 로 넣고(app/onboard 의 saveSpecialPending), 여기서 켠다.
 * 애딧 콘솔의 파트너 승인과 같은 맥락이다. (0923 결정)
 *
 *   GET   승인 대기 목록 (kind=SPECIAL 이고 active=false)
 *   POST  { rid, id, action: "approve" | "reject", note? }
 *
 * 반려는 지우는 게 아니라 **비활성인 채로 두고 메모를 남긴다** — 사장님이 적은 내용을 우리가
 * 말없이 없애면, 나중에 "등록했는데 왜 안 나가냐"에 답할 근거가 사라진다.
 */

export interface Pending {
  rid: number; name: string; campus: string | null; tier: string | null;
  id: number; title: string; subtitle: string; notes: string;
}

interface Benefit { id?: number; title?: string; subtitle?: string; notes?: string; active?: boolean }

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;

  const [backend, remote] = await Promise.all([
    fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/", "include_inactive=1", true),
    remoteGet<{ ops: StoreOps[] }>("/api/astro/stores/ops/"),
  ]);
  const ops = new Map<number, StoreOps>();
  if (remote.handled && remote.ok) for (const o of remote.data?.ops ?? []) ops.set(o.id, o);
  const admin = await getAccessToken();

  // 유료 매장만 본다 — 한정 쿠폰은 Boost 이상의 자리다
  const targets = (backend?.restaurants ?? []).filter((r) => r.is_affiliate && !ops.get(r.restaurant_id)?.is_test && r.tier && r.tier !== "FREE");
  const items: Pending[] = [];
  await Promise.all(targets.map(async (r) => {
    const list = await fetch(backendUrl("/api/dashboard/restaurant-benefits/", `restaurant_id=${r.restaurant_id}&kind=SPECIAL`), { headers: { Authorization: `Bearer ${admin}` }, cache: "no-store" })
      .then(async (x) => (x.ok ? ((await x.json()) as Benefit[]) : [])).catch(() => []);
    for (const b of Array.isArray(list) ? list : []) {
      if (b.active === false && b.id) {
        items.push({ rid: r.restaurant_id, name: r.name, campus: ops.get(r.restaurant_id)?.campus ?? null, tier: r.tier ?? null,
          id: b.id, title: b.title ?? "", subtitle: b.subtitle ?? "", notes: b.notes ?? "" });
      }
    }
  }));
  items.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const b = (await req.json().catch(() => ({}))) as { rid?: number; id?: number; action?: string; note?: string; title?: string; subtitle?: string };
  if (!b.rid || !b.id || !["approve", "reject"].includes(b.action ?? "")) {
    return NextResponse.json({ detail: "rid · id · action(approve|reject) 이 필요합니다." }, { status: 400 });
  }
  const who = (await actorName()) ?? "unknown";

  if (b.action === "approve") {
    // 승인하면서 문구를 다듬을 수 있다 — 캠페인에 그대로 나가는 글이라 여기서 고치는 게 맞다
    const body: Record<string, unknown> = { active: true };
    if (typeof b.title === "string" && b.title.trim()) body.title = b.title.trim();
    if (typeof b.subtitle === "string") body.subtitle = b.subtitle.trim();
    const r = await proxyBody("PATCH", `/api/dashboard/restaurant-benefits/${b.id}/?restaurant_id=${b.rid}`, body);
    if (!r.ok) return NextResponse.json({ detail: `승인하지 못했습니다 (${r.status}).` }, { status: 502 });
    await notifyAstro(`:white_check_mark: 한정 쿠폰 승인 — 매장 ${b.rid} · ${body.title ?? ""} · ${who}`);
    return NextResponse.json({ ok: true });
  }

  // 반려 — 지우지 않는다. 비활성인 채로 사유만 붙인다.
  const note = (b.note ?? "").trim() || "캠페인 편성에서 제외";
  const r = await proxyBody("PATCH", `/api/dashboard/restaurant-benefits/${b.id}/?restaurant_id=${b.rid}`, { active: false, notes: `[보류 ${new Date().toISOString().slice(0, 10)} ${who}] ${note}` });
  if (!r.ok) return NextResponse.json({ detail: `처리하지 못했습니다 (${r.status}).` }, { status: 502 });
  await notifyAstro(`:pause_button: 한정 쿠폰 보류 — 매장 ${b.rid} · ${note} · ${who}\n• 사장님께 사유를 알려 주세요. 화면에는 "확인 중"으로만 보입니다.`);
  return NextResponse.json({ ok: true });
}
