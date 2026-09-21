import { NextRequest, NextResponse } from "next/server";
import { actorName, requireTool } from "@/lib/draft/guard";
import { proxyBody } from "@/lib/apiProxy";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { remoteGet } from "@/lib/draft/remote";
import type { BackendRestaurant, StoreOps } from "@/lib/draft/types";
import { notifyAstro } from "@/lib/slack";
import { describe, diffStore, foldByStore, readLedger, type Diff, type OpsLike } from "@/lib/onboard/reconcile";

/**
 * 온보딩 결과를 매장 파이프라인에 반영한다 — **담당자 권한으로.**
 *
 *   GET   무엇이 반영되지 않았는지만 본다 (아무것도 쓰지 않는다)
 *   POST  실제로 반영한다. `rids` 를 주면 그 매장만.
 *
 * 점주 세션으로는 astro 쓰기가 전부 403 이라 완료 라우트에서 할 수 없다 (lib/onboard/reconcile.ts 머리말).
 * 그래서 우리가 통제하는 원장(시트)을 읽어 여기서 맞춘다.
 */

/**
 * 매장 두 조각을 읽는다 — **`/api/astro/stores` 와 같은 소스**를 쓴다.
 * 운영 행(StoreOps)은 astro 앱, 플랜·제휴는 식당 목록에 있다. 화면이 보는 것과 다른 곳을 보면
 * "반영했다는데 화면은 그대로"가 된다.
 */
async function loadStores(): Promise<Map<number, { tier: string | null; is_affiliate: boolean; ops: OpsLike | null }>> {
  const [backend, remote] = await Promise.all([
    fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/", "include_inactive=1", true),
    remoteGet<{ ops: StoreOps[] }>("/api/astro/stores/ops/"),
  ]);
  const ops = new Map<number, StoreOps>();
  if (remote.handled && remote.ok) for (const o of remote.data?.ops ?? []) ops.set(o.id, o); // ops_json 은 restaurant_id 를 `id` 로 내려준다

  const m = new Map<number, { tier: string | null; is_affiliate: boolean; ops: OpsLike | null }>();
  for (const r of backend?.restaurants ?? []) {
    m.set(r.restaurant_id, { tier: r.tier ?? null, is_affiliate: Boolean(r.is_affiliate), ops: ops.get(r.restaurant_id) ?? null });
  }
  // 운영 행만 있고 식당 목록에 없는 경우(비제휴 제외 등)도 버리지 않는다 — 반영 대상일 수 있다
  for (const [rid, o] of ops) if (!m.has(rid)) m.set(rid, { tier: null, is_affiliate: false, ops: o });
  return m;
}

async function collect(): Promise<Diff[]> {
  const [ledger, stores] = await Promise.all([readLedger(), loadStores()]);
  const out: Diff[] = [];
  for (const f of foldByStore(ledger)) {
    const s = stores.get(f.rid);
    const d = diffStore(f, s?.ops ?? null, s?.tier ?? null, s?.is_affiliate ?? false);
    if (d) out.push(d);
  }
  return out;
}

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  if (!process.env.ONBOARD_GSHEET_URL) return NextResponse.json({ items: [], reason: "원장(시트)이 설정되지 않았습니다." });
  const items = await collect();
  return NextResponse.json({ items: items.map((d) => ({ ...d, summary: describe(d) })) });
}

export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const b = (await req.json().catch(() => ({}))) as { rids?: number[] };
  const only = Array.isArray(b.rids) && b.rids.length ? new Set(b.rids) : null;

  const who = (await actorName()) ?? "unknown";
  const items = (await collect()).filter((d) => !only || only.has(d.rid));
  const applied: { rid: number; name: string; summary: string }[] = [];
  const failed: { rid: number; name: string; detail: string }[] = [];

  for (const d of items) {
    const errs: string[] = [];
    // 1) 운영 행 — 비어 있던 칸만 채운다 (충돌은 건드리지 않는다)
    if (Object.keys(d.fill).length) {
      const r = await proxyBody("PATCH", `/api/astro/stores/${d.rid}/`, { ...d.fill, updated_by: `온보딩 반영 · ${who}` });
      if (!r.ok) errs.push(`운영 값 ${r.status}`);
    }
    // 2) 매장 본체 — 제휴·플랜
    if (Object.keys(d.store).length) {
      const r = await proxyBody("PATCH", `/api/dashboard/admin/restaurants/${d.rid}/`, d.store);
      if (!r.ok) errs.push(`매장 본체 ${r.status}`);
    }
    // 3) 후보 단계
    if (d.lead) {
      const r = await proxyBody("PATCH", `/api/astro/leads/${encodeURIComponent(d.lead.lid)}/`, { stage: d.lead.to });
      if (!r.ok) errs.push(`후보 단계 ${r.status}`);
    }
    if (errs.length) failed.push({ rid: d.rid, name: d.name, detail: errs.join(" · ") });
    else applied.push({ rid: d.rid, name: d.name, summary: describe(d) });
  }

  if (applied.length) {
    await notifyAstro(
      `:arrows_counterclockwise: 온보딩 결과를 매장에 반영했습니다 — ${applied.length}곳 · ${who}\n` +
      applied.map((a) => `• *${a.name}* (${a.rid}) — ${a.summary}`).join("\n") +
      (failed.length ? `\n:warning: 실패 ${failed.length}곳 — ${failed.map((f) => `${f.name}(${f.detail})`).join(", ")}` : "")
    );
  }
  return NextResponse.json({ applied, failed });
}
