import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { readDraft, writeDraft } from "@/lib/draft/store";
import { seedLeads, seedStoreOps } from "@/lib/draft/seed";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import { contractRowToOps, fetchTab, normName, parseTable, rowToLead, statusRowToOps } from "@/lib/draft/sheet";
import { SALES_SHEET } from "@/lib/satellite";
import { notifyAstro } from "@/lib/slack";
import { emptyStoreOps, type BackendRestaurant, type Lead, type StoreOps } from "@/lib/draft/types";

/**
 * 팀 세일즈 시트 → Astro.
 *
 *   GET  ?tab=현황|신규|후보|계약  미리보기 (몇 행, 몇 곳이 매장과 매칭되는지). 아무것도 쓰지 않는다.
 *   POST { tab }                  실제 반영. 같은 매장(정규화한 이름)은 덮어쓰지 않고 **시트 값이 있는 칸만** 채운다.
 *
 * 왜 "있는 칸만": 툴에서 사람이 체크한 입금 확인(확인자·시각 포함)을 시트의 빈 칸이 지우면 안 된다.
 * 시트가 원본인 칸(계약 조건)과 툴이 원본인 칸(입금 확인·활동)이 다르다는 걸 코드가 지킨다.
 */

type Tab = keyof typeof SALES_SHEET.tabs;

function isTab(v: string | null): v is Tab {
  return v === "현황" || v === "신규" || v === "후보" || v === "계약";
}

async function restaurants(): Promise<BackendRestaurant[]> {
  const b = await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/");
  return b?.restaurants ?? (isPreview() ? previewRestaurants() : []);
}

export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const tab = req.nextUrl.searchParams.get("tab");
  if (!isTab(tab)) return NextResponse.json({ detail: "tab 은 현황·신규·후보·계약 중 하나입니다." }, { status: 400 });

  const rows = await fetchTab(SALES_SHEET.tabs[tab]);
  if (rows === null) return NextResponse.json({ ok: false, detail: "시트를 읽지 못했습니다. 공개 설정을 확인하세요." }, { status: 502 });

  const stores = await restaurants();
  const byNorm = new Map(stores.map((s) => [normName(s.name), s]));
  const now = new Date().toISOString();

  if (tab === "계약" || tab === "현황") {
    const infos = rows.map((r) => (tab === "계약" ? contractRowToOps(r, now) : statusRowToOps(r))).filter(Boolean);
    const matched = infos.filter((i) => byNorm.has(i!.norm));
    return NextResponse.json({
      ok: true,
      tab,
      rows: infos.length,
      matched: matched.length,
      unmatched: infos.filter((i) => !byNorm.has(i!.norm)).map((i) => i!.name),
      sheet_url: SALES_SHEET.url(SALES_SHEET.tabs[tab]),
    });
  }

  const leads = rows.map((r) => rowToLead(r, `sheet:${tab}` as Lead["source"], now)).filter(Boolean) as Lead[];
  const existing = readDraft<Lead[]>("astro_leads", seedLeads);
  const have = new Set(existing.map((l) => normName(l.name)));
  return NextResponse.json({
    ok: true,
    tab,
    rows: leads.length,
    new: leads.filter((l) => !have.has(normName(l.name))).length,
    update: leads.filter((l) => have.has(normName(l.name))).length,
    already_contracted: leads.filter((l) => byNorm.has(normName(l.name))).length,
    sheet_url: SALES_SHEET.url(SALES_SHEET.tabs[tab]),
  });
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

  const { tab } = body;
  if (!isTab(tab ?? null)) return NextResponse.json({ detail: "tab 이 필요합니다." }, { status: 400 });

  const rows = await fetchTab(SALES_SHEET.tabs[tab as Tab]);
  if (rows === null) return NextResponse.json({ ok: false, detail: "시트를 읽지 못했습니다." }, { status: 502 });

  const now = new Date().toISOString();
  const stores = await restaurants();
  const byNorm = new Map(stores.map((s) => [normName(s.name), s]));

  if (tab === "계약" || tab === "현황") {
    const infos = (rows.map((r) => (tab === "계약" ? contractRowToOps(r, now) : statusRowToOps(r))).filter(Boolean)) as NonNullable<
      ReturnType<typeof contractRowToOps>
    >[];
    const opsList = [...readDraft<StoreOps[]>("astro_store_ops", seedStoreOps)];
    let applied = 0;
    const unmatched: string[] = [];
    for (const info of infos) {
      const store = byNorm.get(info.norm);
      if (!store) {
        unmatched.push(info.name);
        continue;
      }
      const idx = opsList.findIndex((o) => o.id === store.restaurant_id);
      // 예전 스키마로 저장된 행에는 새 필드가 없다. 기본값 위에 덮어 항상 같은 모양으로 만든다.
      const base: StoreOps = { ...emptyStoreOps(store.restaurant_id), ...(idx === -1 ? {} : opsList[idx]) };
      const next: StoreOps = { ...base };
      for (const [k, v] of Object.entries(info.patch)) {
        if (v === null || v === undefined) continue; // 시트가 빈 칸이면 툴 값을 지우지 않는다
        // 툴에서 이미 '입금 확인'을 찍었으면 시트의 '발송완료'가 그걸 되돌리지 못한다
        if (k === "billing" && base.billing === "PAID") continue;
        if (k === "invoice" && base.invoice === "ISSUED") continue;
        (next as unknown as Record<string, unknown>)[k] = v;
      }
      next.updated_at = now;
      next.updated_by = `sheet:${tab}`;
      if (idx === -1) opsList.push(next);
      else opsList[idx] = next;
      applied += 1;
    }
    writeDraft("astro_store_ops", opsList);
    if (applied) await notifyAstro(`:inbox_tray: *매장 정보 불러오기 — ${tab}* · 반영 ${applied}곳${unmatched?.length ? ` · 매칭 실패 ${unmatched.length}곳` : ""}`);
    return NextResponse.json({ ok: true, tab, applied, unmatched });
  }

  // 후보·신규 → leads. 이름이 같으면 시트 값이 있는 칸만 덮는다.
  const incoming = rows.map((r) => rowToLead(r, `sheet:${tab}` as Lead["source"], now)).filter(Boolean) as Lead[];
  const list = [...readDraft<Lead[]>("astro_leads", seedLeads)];
  let created = 0;
  let updated = 0;
  for (const l of incoming) {
    const key = normName(l.name);
    const idx = list.findIndex((x) => normName(x.name) === key);
    if (idx === -1) {
      list.unshift({ ...l, last_touch_at: l.contacted_at ? null : now, converted_restaurant_id: byNorm.get(key)?.restaurant_id ?? null });
      created += 1;
    } else {
      const cur = list[idx];
      const merged: Lead = { ...cur };
      for (const [k, v] of Object.entries(l)) {
        if (k === "id" || k === "created_at" || k === "last_touch_at") continue;
        if (v === null || v === undefined || v === "") continue;
        (merged as unknown as Record<string, unknown>)[k] = v;
      }
      list[idx] = merged;
      updated += 1;
    }
  }
  writeDraft("astro_leads", list);
  if (created || updated) await notifyAstro(`:inbox_tray: *후보 불러오기 — ${tab}* · 새로 ${created}곳 · 갱신 ${updated}곳`);
  return NextResponse.json({ ok: true, tab, created, updated });
}
