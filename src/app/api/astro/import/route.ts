import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { readDraft, writeDraft } from "@/lib/draft/store";
import { remoteGet, remoteSend } from "@/lib/draft/remote";
import { seedLeads, seedStoreOps } from "@/lib/draft/seed";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import { normName, parseTable, rowToLead } from "@/lib/draft/sheet";
import { notifyAstro } from "@/lib/slack";
import { emptyStoreOps, type BackendRestaurant, type Lead, type StoreOps } from "@/lib/draft/types";

/**
 * 후보 불러오기 — **붙여넣기·CSV 만** 받는다.
 *
 * 0921 민열님이 팀 시트를 걷어냈다(세틀라이트·슬랙·카톡 셋만 쓴다). 시트 탭을 읽어 오던 길은 지웠다.
 * 이미 있는 이름은 건드리지 않는다 — 툴에서 고친 값을 붙여넣기가 덮으면 "툴이 원본"이라는 말이 거짓이 된다.
 */

async function restaurants(): Promise<BackendRestaurant[]> {
  const b = await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/");
  return b?.restaurants ?? (isPreview() ? previewRestaurants() : []);
}

export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const body = (await req.json().catch(() => ({}))) as { tab?: string; text?: string; dry?: boolean };

  // 붙여넣기 · 양식 업로드 — 시트 링크 없이 표를 그대로 받는다 (민열님 0911: "시트 붙여넣거나 고정 양식 업로드").
  if (typeof body.text === "string") {
    const parsed = parseTable(body.text);
    if (!parsed.length) return NextResponse.json({ detail: "읽을 수 있는 행이 없습니다. 첫 줄이 머리글(매장명 …)인지 확인하세요." }, { status: 400 });
    const now = new Date().toISOString();
    const incoming = parsed.map((r) => rowToLead(r, "paste", now)).filter(Boolean) as Lead[];
    const skipped = parsed.length - incoming.length;
    const stores = await restaurants();
    const byNorm = new Map(stores.map((st) => [normName(st.name), st]));
    // 원본이 백엔드면 그쪽에 넣는다. 이미 있는 이름은 건드리지 않는다 —
    // 툴에서 고친 값을 붙여넣기가 덮으면 "툴이 원본"이라는 말이 거짓이 된다.
    const onBackend = (await remoteGet<{ leads: Lead[] }>("/api/astro/leads/")).ok;
    if (onBackend && !body.dry) {
      const push = await remoteSend<{ created: number; skipped: number }>("POST", "/api/astro/leads/bulk/", { leads: incoming.map((l) => ({ ...l, source: "paste" })) });
      if (!push.ok) return NextResponse.json(push.data ?? { detail: "가져오지 못했습니다." }, { status: push.status });
      return NextResponse.json({ ok: true, tab: "붙여넣기", rows: parsed.length, created: push.data?.created ?? 0, updated: 0, kept: push.data?.skipped ?? 0, skipped, columns: Object.keys(parsed[0]), dry: false, draft: false });
    }
    const list = [...readDraft<Lead[]>("astro_leads", seedLeads)];
    let created = 0, updated = 0;
    const names: string[] = [];
    for (const l of incoming) {
      const key = normName(l.name);
      const idx = list.findIndex((x) => normName(x.name) === key);
      if (idx === -1) { created += 1; names.push(l.name); if (!body.dry) list.unshift({ ...l, converted_restaurant_id: byNorm.get(key)?.restaurant_id ?? null }); }
      else {
        updated += 1;
        if (!body.dry) {
          const merged: Lead = { ...list[idx] };
          for (const [k, v] of Object.entries(l)) { if (k === "id" || k === "created_at" || k === "last_touch_at" || k === "source") continue; if (v === null || v === undefined || v === "") continue; (merged as unknown as Record<string, unknown>)[k] = v; }
          list[idx] = merged;
        }
      }
    }
    if (!body.dry) writeDraft("astro_leads", list);
    return NextResponse.json({ ok: true, tab: "붙여넣기", rows: parsed.length, created, updated, skipped, columns: Object.keys(parsed[0]), sample: names.slice(0, 8), dry: Boolean(body.dry) });
  }

  return NextResponse.json({ detail: "붙여넣기나 CSV 로 올려 주세요. 팀 시트는 0921 부터 쓰지 않습니다." }, { status: 400 });
}
