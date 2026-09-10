import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { readDraft, writeDraft } from "@/lib/draft/store";
import { seedInvoices, seedIssuer, seedStoreOps } from "@/lib/draft/seed";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import { emptyStoreOps, isPaidTier, type BackendRestaurant, type IssuerSettings, type StoreOps, type TaxInvoice } from "@/lib/draft/types";
import { sendSlackNotification } from "@/lib/slack";

/**
 * 세금계산서 목록 · 월납 일괄 생성.
 *
 * 세발에서 가져온 것: 품의 → 승인 → 발행 세 단계, 단계마다 슬랙(📄/🧾/✅).
 * 우리가 더한 것: **월납 청구 자동 생성** — 유료 매장 × 월 이용료를 매월 한 번에 품의로 세운다.
 * 세발 분석(0830)이 말한 "만드는 이유의 80%"가 이것이다.
 */

const KEY = "astro_invoices";

export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const period = req.nextUrl.searchParams.get("period");
  let list = readDraft<TaxInvoice[]>(KEY, seedInvoices);
  if (period) list = list.filter((i) => i.period === period);
  return NextResponse.json({ invoices: list, draft: true });
}

/** POST { period: "2026-09", requested_by } → 그 달 계산서가 없는 유료 매장마다 품의(PENDING) 생성 */
export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { period, requested_by } = (await req.json().catch(() => ({}))) as { period?: string; requested_by?: string };
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return NextResponse.json({ detail: "period 는 YYYY-MM 이어야 합니다." }, { status: 400 });

  const b = await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/");
  const stores = b?.restaurants ?? (isPreview() ? previewRestaurants() : []);
  const ops = new Map(readDraft<StoreOps[]>("astro_store_ops", seedStoreOps).map((o) => [o.id, { ...emptyStoreOps(o.id), ...o }]));
  const issuer = readDraft<IssuerSettings>("astro_issuer", seedIssuer);
  const existing = readDraft<TaxInvoice[]>(KEY, seedInvoices);
  const have = new Set(existing.filter((i) => i.period === period && i.status !== "CANCELED" && i.status !== "REJECTED").map((i) => i.restaurant_id));

  const now = new Date().toISOString();
  const [y, m] = period.split("-");
  const label = `${y}년 ${Number(m)}월`;
  const created: TaxInvoice[] = [];
  const skipped: string[] = [];

  for (const s of stores) {
    if (s.is_affiliate === false || !isPaidTier(s.tier)) continue;
    const o = ops.get(s.restaurant_id);
    const fee = o?.monthly_fee ?? null;
    if (!fee || fee <= 0) { skipped.push(`${s.name} (월 이용료 없음)`); continue; }
    if (o?.pay_cycle === "LUMP") { skipped.push(`${s.name} (일시납)`); continue; }
    if (have.has(s.restaurant_id)) continue;
    // 월 이용료는 VAT 포함(시트 열 이름). 공급가 = 합계 / 1.1, 세액 = 나머지.
    const supply = Math.round(fee / 1.1);
    const tax = fee - supply;
    created.push({
      id: `inv-${period}-${s.restaurant_id}`,
      restaurant_id: s.restaurant_id,
      name: s.name,
      title: issuer.item_template.replace("{period}", label),
      period,
      supply, tax, total: fee,
      tax_type: "TAXABLE",
      receipt_type: "CLAIM",
      write_date: now.slice(0, 10),
      counterparty: { biz_no: o?.biz_no ?? null, ceo: o?.owner_name ?? null, email: null, phone: o?.owner_phone ?? null },
      status: "PENDING",
      requested_by: requested_by ?? "unknown",
      requested_at: now,
      approved_by: null, approved_at: null, issued_at: null,
      nts_no: null, bolta_key: null, url: null, fail_code: null, attempts: 0, reject_reason: null,
      paid_at: null,
      memo: null,
    });
  }

  if (created.length) {
    writeDraft(KEY, [...created, ...existing]);
    await sendSlackNotification(
      "SLACK_FEEDBACK_WEBHOOK_URL",
      `:page_facing_up: *세금계산서 품의 ${created.length}건* — ${label} 월납 · ${requested_by ?? ""}\n${created.map((c) => `· ${c.name} ${c.total.toLocaleString()}원`).join("\n")}`
    );
  }
  return NextResponse.json({ ok: true, created: created.length, skipped, draft: true });
}
