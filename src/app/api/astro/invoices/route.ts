import { NextRequest, NextResponse } from "next/server";
import { actorName, requireTool } from "@/lib/draft/guard";
import { readDraft, writeDraft } from "@/lib/draft/store";
import { seedInvoices, seedIssuer, seedStoreOps } from "@/lib/draft/seed";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import { emptyStoreOps, isPaidTier, type BackendRestaurant, type IssuerSettings, type StoreOps, type TaxInvoice } from "@/lib/draft/types";
import { notifyAstro } from "@/lib/slack";

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
  const { period, requested_by, restaurant_id, paid_on } = (await req.json().catch(() => ({}))) as { period?: string; requested_by?: string; restaurant_id?: number; paid_on?: string };
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return NextResponse.json({ detail: "period 는 YYYY-MM 이어야 합니다." }, { status: 400 });
  // restaurant_id 를 주면 그 매장 한 곳만 만든다 — 입금 현황 표에서 한 줄만 되살릴 때 (민열님 0914).
  const only = typeof restaurant_id === "number" ? restaurant_id : null;
  // paid_on 을 같이 주면 **만들고 곧바로 입금까지 찍는다.**
  // 돈은 이미 들어와 있는데 청구서를 먼저 만들라고 시키는 건 순서가 뒤바뀐 요구다 (민열님 0914).
  if (paid_on !== undefined) {
    if (only === null) return NextResponse.json({ detail: "입금을 찍으려면 매장을 지정해야 합니다." }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paid_on)) return NextResponse.json({ detail: "입금일은 YYYY-MM-DD 형식이어야 합니다." }, { status: 400 });
    if (paid_on > new Date().toISOString().slice(0, 10)) return NextResponse.json({ detail: "입금일은 오늘 이후가 될 수 없습니다." }, { status: 400 });
  }

  const b = await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/");
  const stores = b?.restaurants ?? (isPreview() ? previewRestaurants() : []);
  const ops = new Map(readDraft<StoreOps[]>("astro_store_ops", seedStoreOps).map((o) => [o.id, { ...emptyStoreOps(o.id), ...o }]));
  const issuer = readDraft<IssuerSettings>("astro_issuer", seedIssuer);
  const existing = readDraft<TaxInvoice[]>(KEY, seedInvoices);
  const have = new Set(existing.filter((i) => i.period === period && i.status !== "CANCELED" && i.status !== "REJECTED").map((i) => i.restaurant_id));

  const actor = await actorName();

  // 이미 그 달 청구가 있는 매장에 입금만 찍으러 온 경우 — 새로 만들지 않고 그 건을 쓴다.
  if (paid_on !== undefined && only !== null) {
    const found = existing.find((i) => i.restaurant_id === only && i.period === period && !["CANCELED", "REJECTED"].includes(i.status));
    if (found) {
      if (found.paid_at) return NextResponse.json({ detail: "이미 입금 확인된 건입니다." }, { status: 409 });
      const at = `${paid_on}T00:00:00.000Z`;
      const list = readDraft<TaxInvoice[]>(KEY, seedInvoices).map((i) => (i.id === found.id ? { ...i, paid_at: at } : i));
      writeDraft(KEY, list);
      syncPaid(only, at, actor ?? requested_by ?? "unknown");
      await notifyAstro(`:moneybag: *입금 확인* — ${found.name} · ${found.total.toLocaleString()}원 · ${paid_on} · ${actor ?? requested_by ?? ""}`);
      return NextResponse.json({ ok: true, created: 0, paid: 1, skipped: [], draft: true });
    }
  }

  const now = new Date().toISOString();
  const [y, m] = period.split("-");
  const label = `${y}년 ${Number(m)}월`;
  const created: TaxInvoice[] = [];
  const skipped: string[] = [];

  for (const s of stores) {
    if (only !== null && s.restaurant_id !== only) continue;
    if (s.is_affiliate === false || !isPaidTier(s.tier)) continue;
    const o = ops.get(s.restaurant_id);
    const fee = o?.monthly_fee ?? null;
    if (!fee || fee <= 0) { skipped.push(`${s.name} (월 이용료 없음)`); continue; }
    if (o?.pay_cycle === "LUMP") { skipped.push(`${s.name} (일시납)`); continue; }
    // 청구 시작 월 전이면 만들지 않는다 — 월 중간 합류 매장은 이번 달/다음 달을 고르게 했다
    const start = o?.billing_start_period ?? (o?.contract_started_on ? o.contract_started_on.slice(0, 7) : null);
    if (start && period < start) { skipped.push(`${s.name} (${Number(start.slice(5))}월부터)`); continue; }
    if (have.has(s.restaurant_id)) continue;
    // 월 이용료는 VAT 포함(시트 열 이름). 공급가 = 합계 / 1.1, 세액 = 나머지.
    const supply = Math.round(fee / 1.1);
    const tax = fee - supply;
    created.push({
      // 반려·취소 뒤 재청구는 같은 id 를 두 번 만들면 안 된다 — 뒤에 -2, -3 을 붙인다.
      id: (() => { const base = `inv-${period}-${s.restaurant_id}`; let id = base; for (let k = 2; existing.some((i) => i.id === id); k++) id = `${base}-${k}`; return id; })(),
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
      requested_by: actor ?? requested_by ?? "unknown",
      requested_at: now,
      approved_by: null, approved_at: null, issued_at: null,
      nts_no: null, bolta_key: null, url: null, fail_code: null, attempts: 0, reject_reason: null,
      paid_at: null,
      memo: null,
    });
  }

  // 만들면서 곧바로 입금까지 (한 매장일 때만)
  const at = paid_on ? `${paid_on}T00:00:00.000Z` : null;
  if (at) for (const c of created) c.paid_at = at;

  if (created.length) {
    writeDraft(KEY, [...created, ...existing]);
    if (at) {
      for (const c of created) syncPaid(c.restaurant_id, at, actor ?? requested_by ?? "unknown");
      await notifyAstro(`:moneybag: *입금 확인* — ${created.map((c) => `${c.name} ${c.total.toLocaleString()}원`).join(", ")} · ${paid_on} · ${actor ?? requested_by ?? ""}`);
    } else {
      await notifyAstro(
        `:page_facing_up: *세금계산서 품의 ${created.length}건* — ${label} 월납 · ${actor ?? requested_by ?? ""}\n${created.map((c) => `· ${c.name} ${c.total.toLocaleString()}원`).join("\n")}`
      );
    }
  }
  return NextResponse.json({ ok: true, created: created.length, paid: at ? created.length : 0, skipped, draft: true });
}

/** 입금을 찍으면 매장 운영의 수금 상태도 같은 값으로 옮긴다 — 두 화면이 다른 말을 하지 않게. */
function syncPaid(restaurantId: number, at: string, by: string) {
  const list = [...readDraft<StoreOps[]>("astro_store_ops", seedStoreOps)];
  const idx = list.findIndex((o) => o.id === restaurantId);
  const base = { ...emptyStoreOps(restaurantId), ...(idx === -1 ? {} : list[idx]) };
  const next: StoreOps = { ...base, billing: "PAID", billing_checked_at: at.slice(0, 10), billing_checked_by: by, updated_at: new Date().toISOString(), updated_by: by };
  if (idx === -1) list.push(next); else list[idx] = next;
  writeDraft("astro_store_ops", list);
}
