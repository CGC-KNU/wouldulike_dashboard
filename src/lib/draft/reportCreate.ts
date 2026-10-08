import { readDraft } from "@/lib/draft/store";
import { ReportStoreError, createReport, listReports } from "@/lib/draft/reportStore";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import { fetchPapillonMonths, sponsorStores } from "@/lib/draft/papillon";
import { normName } from "@/lib/draft/sheet";
import { buildSnapshot } from "@/lib/draft/snapshot";
import { cohortNote, ownerHeadline, ownerStory, propose } from "@/lib/draft/report";
import { seedStoreOps } from "@/lib/draft/seed";
import type { BackendRestaurant, StoreOps, StoreReport } from "@/lib/draft/types";

/**
 * 매장 리포트 초안 만들기 — 담당자의 「만들기」(POST /api/probe/reports)와 14일차 자동 초안(/reports/auto)이 함께 쓴다.
 * 지금 값으로 스냅샷을 굳힌 초안을 만든다. 같은 게시물·매장에 살아 있는 리포트가 있으면 새로 만들지 않는다(force 가 아니면 409).
 * 앱에 없는 협찬 매장(1001)은 restaurant_id 대신 store_name — 그 게시물의 협찬 매장(`sponsorStores`)일 때만 받는다.
 */
export type CreateOutcome =
  | { ok: true; report: StoreReport }
  | { ok: false; status: number; detail: string; report?: StoreReport };

export async function createReportDraft(input: { restaurant_id?: number | null; store_name?: string; plan_id?: number; force?: boolean; actor: string }): Promise<CreateOutcome> {
  const sponsorName = input.restaurant_id ? "" : (input.store_name ?? "").trim();
  if (!input.plan_id || (!input.restaurant_id && !sponsorName)) return { ok: false, status: 400, detail: "plan_id 와 restaurant_id(앱에 없는 협찬 매장이면 store_name)가 필요합니다." };

  let mine: StoreReport[];
  try {
    mine = input.restaurant_id
      ? await listReports({ restaurant_id: input.restaurant_id })
      : (await listReports()).filter((r) => r.restaurant_id === null && normName(r.snapshot?.store?.name ?? "") === normName(sponsorName));
  } catch (e) {
    return storeFail(e, "리포트를 읽지 못했습니다.");
  }
  const existing = mine.find((r) => r.plan_id === input.plan_id && r.status !== "REVOKED");
  if (existing && !input.force) return { ok: false, status: 409, detail: `이 게시물 리포트는 이미 있습니다 (${existing.status}). 갱신본을 만들려면 force 를 주세요.`, report: existing };

  const backend = await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/");
  const stores = backend?.restaurants ?? (isPreview() ? previewRestaurants() : []);
  const pap = await fetchPapillonMonths(3);
  const plan = pap.plans.find((p) => p.id === input.plan_id);
  if (!plan) return { ok: false, status: 404, detail: "Papillon 기획을 찾을 수 없습니다 (백엔드 연결 확인)." };
  let store: { restaurant_id: number | null; name: string; campus: StoreOps["campus"] | null };
  if (input.restaurant_id) {
    const found = stores.find((s) => s.restaurant_id === input.restaurant_id);
    if (!found) return { ok: false, status: 404, detail: "매장을 찾을 수 없습니다." };
    const ops = readDraft<StoreOps[]>("astro_store_ops", seedStoreOps).find((o) => o.id === found.restaurant_id);
    store = { restaurant_id: found.restaurant_id, name: found.name, campus: ops?.campus ?? null };
  } else {
    const name = sponsorStores(plan.topic, pap.sponsorships).find((n) => normName(n) === normName(sponsorName));
    if (!name) return { ok: false, status: 404, detail: "이 게시물의 협찬 매장이 아닙니다." };
    store = { restaurant_id: null, name, campus: null };
  }

  const snapshot = await buildSnapshot(store, plan, stores.filter((s) => s.is_affiliate !== false));
  snapshot.cohort_note = cohortNote(snapshot.metrics);
  const usedRules = mine.filter((r) => r.status === "SENT").flatMap((r) => r.proposals.filter((p) => p.approved).map((p) => p.rule));
  const now = new Date().toISOString();

  try {
    const report = await createReport({
      id: `rep-${Date.now()}`,
      token: null, restaurant_id: store.restaurant_id, plan_id: plan.id, kind: "post", status: "DRAFT",
      title: `${store.name} 인스타그램 홍보 성과`,
      // 점주 문장 — 우리 채널과 견주지 않는다(0925). 채널 비교는 cohort_note · 제안 근거 줄(내부)에만.
      summary: ownerHeadline(snapshot),
      interpretation: ownerStory(snapshot),
      snapshot, proposals: propose(snapshot, usedRules),
      created_by: input.actor, created_at: now, approved_by: null, approved_at: null, linked_at: null, sent_at: null, revoked_at: null,
      views: { count: 0, first_at: null, last_at: null },
    });
    return { ok: true, report };
  } catch (e) {
    return storeFail(e, "리포트를 저장하지 못했습니다.");
  }
}

function storeFail(e: unknown, fallback: string): CreateOutcome {
  if (e instanceof ReportStoreError) return { ok: false, status: e.status >= 500 ? 502 : e.status, detail: e.message };
  return { ok: false, status: 502, detail: fallback };
}
