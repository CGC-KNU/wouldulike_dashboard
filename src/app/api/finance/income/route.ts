import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/draft/guard";
import { readDraft } from "@/lib/draft/store";
import { remoteGet } from "@/lib/draft/remote";
import { seedInvoices } from "@/lib/draft/seed";
import type { TaxInvoice } from "@/lib/draft/types";
import type { SpotJob } from "@/lib/draft/spot";
import { invoiceIncome, sortByDateDesc, spotIncome } from "@/lib/finance/calc";

/**
 * 재무 · 입금 내역 — **읽기 전용**.
 *
 * 입금을 찍는 곳은 Astro 하나다(입금 현황 · 스팟 제작). 여기서는 그 기록을 모아서 돌려줄 뿐이고,
 * 입금을 새로 쓰는 길은 만들지 않았다 — 두 화면이 다른 숫자를 말하지 않게.
 * 원본은 Astro 와 같은 읽기 경로를 그대로 쓴다: 백엔드(astro 앱)가 답하면 그쪽, 아니면 초안 저장소.
 */
export async function GET() {
  const deny = await requireFinance();
  if (deny) return deny;

  const [inv, spots] = await Promise.all([
    remoteGet<{ invoices: TaxInvoice[] }>("/api/astro/invoices/"),
    remoteGet<{ spots: SpotJob[] }>("/api/astro/spots/"),
  ]);

  // 백엔드가 답했는데 거절(401·403·5xx)이면 초안으로 덮지 않고 그대로 올린다 — 입금이 비어 보이면 안 된다.
  for (const r of [inv, spots]) {
    if (r.handled && !r.ok) return NextResponse.json(r.data ?? { detail: "입금 기록을 읽지 못했습니다." }, { status: r.status });
  }

  const invoices = inv.handled ? (inv.data?.invoices ?? []) : readDraft<TaxInvoice[]>("astro_invoices", seedInvoices);
  const spotList = spots.handled ? (spots.data?.spots ?? []) : readDraft<SpotJob[]>("astro_spots", () => []);

  return NextResponse.json({
    income: sortByDateDesc([...invoiceIncome(invoices), ...spotIncome(spotList)]),
    // 초안 저장소를 읽었으면 알린다 — 실데이터와 섞여 보이면 안 된다
    draft: !inv.handled || !spots.handled,
  });
}
