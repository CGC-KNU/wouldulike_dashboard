import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { readDraft } from "@/lib/draft/store";
import { seedLeads, seedStoreOps } from "@/lib/draft/seed";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import { CONTRACT_CSV_HEAD, LEAD_CSV_HEAD, contractToCsvRow, leadToCsvRow, toCsv } from "@/lib/draft/sheet";
import { emptyStoreOps, isPaidTier, type BackendRestaurant, type Lead, type StoreOps } from "@/lib/draft/types";

/**
 * 시트와 같은 열 순서의 CSV 내보내기.
 * Astro 가 원본이 된 뒤에도 시트에 붙여넣거나 외부에 넘길 일이 있다. 열 순서를 시트와 똑같이 맞췄다.
 *   ?tab=후보   입점 후보 전체
 *   ?tab=계약   제휴 매장 계약 세부사항 (유료·무료 전부)
 */

export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const tab = req.nextUrl.searchParams.get("tab") ?? "후보";
  // 빈 양식 — 머리글 + 예시 한 줄. 채워서 '양식 업로드'로 되돌려 넣는다.
  if (tab === "양식") {
    // toCsv 가 이미 BOM 을 붙인다(엑셀 한글). 예시 줄 하나로 형식만 보여준다.
    return new NextResponse(toCsv(LEAD_CSV_HEAD, [["경북대", "준영", "예시식당 (이 줄은 지우세요)", "053-000-0000", "", "한식", "", "", "", "신규", "B", "미컨택", "", "", "", "", "", "", "", "", "", "", ""]]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="astro_leads_template.csv"` } });
  }
  const district = req.nextUrl.searchParams.get("district");
  const today = new Date().toISOString().slice(0, 10);

  let csv: string;
  let file: string;
  if (tab === "계약") {
    const b = await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/");
    const stores = b?.restaurants ?? (isPreview() ? previewRestaurants() : []);
    const ops = new Map(readDraft<StoreOps[]>("astro_store_ops", seedStoreOps).map((o) => [o.id, o]));
    const rows = stores
      .filter((s) => s.is_affiliate !== false)
      .map((s) => ({ s, o: { ...emptyStoreOps(s.restaurant_id), ...(ops.get(s.restaurant_id) ?? {}) } }))
      .filter(({ o }) => !district || o.district === district)
      .sort((a, b) => Number(isPaidTier(b.s.tier)) - Number(isPaidTier(a.s.tier)) || a.s.name.localeCompare(b.s.name, "ko"))
      .map(({ s, o }) => contractToCsvRow(s.name, s.tier, o));
    csv = toCsv(CONTRACT_CSV_HEAD, rows);
    file = `astro_계약세부사항_${today}.csv`;
  } else {
    const leads = readDraft<Lead[]>("astro_leads", seedLeads).filter((l) => !district || l.district === district);
    csv = toCsv(LEAD_CSV_HEAD, leads.map(leadToCsvRow));
    file = `astro_입점후보_${today}.csv`;
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file)}`,
    },
  });
}
