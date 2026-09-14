import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { patchDraftItem, readDraft, writeDraft } from "@/lib/draft/store";
import { seedLeads, seedStoreOps } from "@/lib/draft/seed";
import { clearBackendCache, fetchBackendJson } from "@/lib/draft/toolProxy";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import { normName } from "@/lib/draft/sheet";
import { emptyStoreOps, type BackendRestaurant, type Lead, type StoreOps } from "@/lib/draft/types";
import { proxyBody } from "@/lib/apiProxy";
import { notifyAstro } from "@/lib/slack";
import { remoteGet, remoteSend } from "@/lib/draft/remote";

/**
 * 입점 후보 → 제휴 매장.
 *
 * 시트에서는 '계약 완료'가 되면 사람이 '계약 세부사항' 탭에 행을 손으로 옮겨 적었다.
 * 여기서는 후보 카드에서 버튼 하나로 (1) 대시보드 매장을 만들고 (2) 후보의 상권·대표자·연락처·제안 플랜을
 * 매장 운영 필드로 옮기고 (3) 후보에 매장 ID 를 잇는다. 이미 같은 이름의 매장이 있으면 만들지 않고 잇기만 한다.
 *
 * 매장 생성은 기존 `/api/dashboard/admin/restaurants/create/` 를 그대로 쓴다 (식당 관리와 같은 경로).
 */

export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { lead_id, tier, updated_by } = (await req.json().catch(() => ({}))) as { lead_id?: string; tier?: string | null; updated_by?: string };
  if (!lead_id) return NextResponse.json({ detail: "lead_id 가 필요합니다." }, { status: 400 });

  // 원본이 백엔드면 거기서 읽는다. 폴백이면 초안에서.
  const leadsRes = await remoteGet<{ leads: Lead[] }>("/api/astro/leads/");
  const onBackend = leadsRes.handled && leadsRes.ok;
  const lead = (onBackend ? (leadsRes.data?.leads ?? []) : readDraft<Lead[]>("astro_leads", seedLeads)).find((l) => l.id === lead_id);
  if (!lead) return NextResponse.json({ detail: "후보를 찾을 수 없습니다." }, { status: 404 });

  // 1) 같은 이름의 매장이 있으면 잇기만 한다
  const b = await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/");
  const stores = b?.restaurants ?? (isPreview() ? previewRestaurants() : []);
  let store = stores.find((s) => normName(s.name) === normName(lead.name)) ?? null;
  let created = false;

  if (!store) {
    if (isPreview() && !process.env.NEXT_PUBLIC_API_URL) {
      return NextResponse.json(
        { detail: "미리보기 모드에서는 매장을 만들 수 없습니다. 백엔드에 붙으면 '식당 관리'와 같은 경로로 생성됩니다." },
        { status: 501 }
      );
    }
    const res = await proxyBody("POST", "/api/dashboard/admin/restaurants/create/", {
      name: lead.name,
      address: "",
      phone_number: lead.phone ?? "",
      category: lead.category ?? "",
      url: lead.link ?? "",
      main_menu: "",
      description: "",
      s3_image_urls: [],
      tier: tier ?? null,
    });
    const data = (await res.json().catch(() => ({}))) as { restaurant_id?: number; id?: number; detail?: string };
    if (!res.ok) return NextResponse.json({ detail: data.detail ?? "매장을 만들지 못했습니다." }, { status: res.status });
    const id = data.restaurant_id ?? data.id;
    if (!id) return NextResponse.json({ detail: "매장 ID 를 받지 못했습니다." }, { status: 502 });
    store = { restaurant_id: id, name: lead.name, tier: tier ?? null, is_affiliate: true };
    created = true;
    clearBackendCache(); // 방금 만든 매장이 목록에 바로 보이게
  }

  // 2) 후보의 정보를 매장 운영 필드로
  const now = new Date().toISOString();
  if (onBackend) {
    const cur = await remoteGet<{ ops: StoreOps | null }>(`/api/astro/stores/${store.restaurant_id}/`);
    const base = cur.ok ? cur.data?.ops ?? null : null;
    await remoteSend("PATCH", `/api/astro/stores/${store.restaurant_id}/`, {
      campus: base?.campus ?? lead.campus,
      district: base?.district ?? lead.district,
      owner_name: base?.owner_name ?? lead.owner_name,
      owner_phone: base?.owner_phone ?? lead.contact ?? lead.phone,
      sheet_owner: base?.sheet_owner ?? lead.owner,
      memo: base?.memo ?? (lead.proposed_plan ? `제안 플랜: ${lead.proposed_plan}` : null),
      updated_by: updated_by ?? "convert",
    });
    const patched = await remoteSend<{ lead: Lead }>("PATCH", `/api/astro/leads/${lead_id}/`, {
      converted_restaurant_id: store.restaurant_id,
      stage: "계약 완료",
    });
    await notifyAstro(
      `:tada: *파트너 전환* — ${lead.name}${lead.campus ? ` · ${lead.campus}` : ""}${tier ? ` · ${tier}` : ""} ${created ? "(매장 새로 만듦)" : "(기존 매장에 연결)"} · ${updated_by ?? "unknown"}`
    );
    return NextResponse.json({ ok: true, created, restaurant_id: store.restaurant_id, lead: patched.data?.lead ?? lead, draft: false });
  }

  const list = [...readDraft<StoreOps[]>("astro_store_ops", seedStoreOps)];
  const idx = list.findIndex((o) => o.id === store!.restaurant_id);
  const base: StoreOps = { ...emptyStoreOps(store.restaurant_id), ...(idx === -1 ? {} : list[idx]) };
  const next: StoreOps = {
    ...base,
    campus: base.campus ?? lead.campus,
    district: base.district ?? lead.district,
    owner_name: base.owner_name ?? lead.owner_name,
    owner_phone: base.owner_phone ?? lead.contact ?? lead.phone,
    sheet_owner: base.sheet_owner ?? lead.owner,
    memo: base.memo ?? (lead.proposed_plan ? `제안 플랜: ${lead.proposed_plan}` : null),
    updated_at: now,
    updated_by: updated_by ?? "convert",
  };
  if (idx === -1) list.push(next);
  else list[idx] = next;
  writeDraft("astro_store_ops", list);

  // 3) 후보에 매장을 잇고 단계를 계약 완료로
  const lead2 = patchDraftItem<Lead>("astro_leads", seedLeads, lead_id, {
    converted_restaurant_id: store.restaurant_id,
    stage: "계약 완료",
    last_touch_at: now,
  });

  await notifyAstro(
    `:tada: *파트너 전환* — ${lead.name}${lead.campus ? ` · ${lead.campus}` : ""}${tier ? ` · ${tier}` : ""} ${created ? "(매장 새로 만듦)" : "(기존 매장에 연결)"} · ${updated_by ?? "unknown"}`
  );
  return NextResponse.json({ ok: true, created, restaurant_id: store.restaurant_id, lead: lead2, draft: true });
}
