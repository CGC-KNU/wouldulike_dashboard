import { NextRequest, NextResponse } from "next/server";
import { actorName, requireTool } from "@/lib/draft/guard";
import { readDraft } from "@/lib/draft/store";
import { ReportStoreError, createReport, listReports, reportsOnBackend } from "@/lib/draft/reportStore";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import { fetchPapillonMonths, sponsorStores } from "@/lib/draft/papillon";
import { normName } from "@/lib/draft/sheet";
import { buildSnapshot } from "@/lib/draft/snapshot";
import { cohortNote, ownerHeadline, ownerStory, propose } from "@/lib/draft/report";
import { seedStoreOps } from "@/lib/draft/seed";
import type { BackendRestaurant, StoreOps, StoreReport } from "@/lib/draft/types";

/**
 * Probe · 매장 리포트 (점주에게 보내는 공개 링크의 원본).
 *
 * 흐름: 만들기(스냅샷 고정) → 검토·문구 수정 → 승인(금지 표현 검사) → 링크 발급(토큰) → 카톡은 사람 → 열람.
 * 저장은 백엔드 `probe.StoreReport`(reportStore.ts). 백엔드가 없는 로컬·미리보기에서만 초안 파일.
 */

const storeError = (e: unknown) => e instanceof ReportStoreError ? NextResponse.json({ detail: e.message }, { status: e.status >= 500 ? 502 : e.status }) : null;
const draftNote = () => (reportsOnBackend() ? {} : { draft: true, draft_note: "리포트는 초안 저장소에 있습니다. 백엔드에 붙으면 옮겨 갑니다." });

export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const status = req.nextUrl.searchParams.get("status");
  const rid = req.nextUrl.searchParams.get("restaurant_id");
  try {
    const list = await listReports({ status: status ?? undefined, restaurant_id: rid ? Number(rid) : undefined });
    return NextResponse.json({ reports: list, ...draftNote() });
  } catch (e) {
    return storeError(e) ?? NextResponse.json({ detail: "리포트를 읽지 못했습니다." }, { status: 502 });
  }
}

/**
 * POST { restaurant_id, plan_id } — 지금 값으로 스냅샷을 굳힌 리포트 초안을 만든다. 같은 게시물·매장에 살아 있는 리포트가 있으면 새로 만들지 않는다.
 * 앱에 없는 협찬 매장(1001)은 restaurant_id 대신 store_name — 그 게시물의 협찬 매장(`sponsorStores`)일 때만 받는다.
 */
export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const body = (await req.json().catch(() => ({}))) as { restaurant_id?: number | null; store_name?: string; plan_id?: number; force?: boolean };
  const sponsorName = body.restaurant_id ? "" : (body.store_name ?? "").trim();
  if (!body.plan_id || (!body.restaurant_id && !sponsorName)) return NextResponse.json({ detail: "plan_id 와 restaurant_id(앱에 없는 협찬 매장이면 store_name)가 필요합니다." }, { status: 400 });

  let mine: StoreReport[];
  try {
    mine = body.restaurant_id
      ? await listReports({ restaurant_id: body.restaurant_id })
      : (await listReports()).filter((r) => r.restaurant_id === null && normName(r.snapshot?.store?.name ?? "") === normName(sponsorName));
  } catch (e) { return storeError(e) ?? NextResponse.json({ detail: "리포트를 읽지 못했습니다." }, { status: 502 }); }
  const existing = mine.find((r) => r.plan_id === body.plan_id && r.status !== "REVOKED");
  if (existing && !body.force) return NextResponse.json({ detail: `이 게시물 리포트는 이미 있습니다 (${existing.status}). 갱신본을 만들려면 force 를 주세요.`, report: existing }, { status: 409 });

  const backend = await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/");
  const stores = backend?.restaurants ?? (isPreview() ? previewRestaurants() : []);
  const pap = await fetchPapillonMonths(3);
  const plan = pap.plans.find((p) => p.id === body.plan_id);
  if (!plan) return NextResponse.json({ detail: "Papillon 기획을 찾을 수 없습니다 (백엔드 연결 확인)." }, { status: 404 });
  let store: { restaurant_id: number | null; name: string; campus: StoreOps["campus"] | null };
  if (body.restaurant_id) {
    const found = stores.find((s) => s.restaurant_id === body.restaurant_id);
    if (!found) return NextResponse.json({ detail: "매장을 찾을 수 없습니다." }, { status: 404 });
    const ops = readDraft<StoreOps[]>("astro_store_ops", seedStoreOps).find((o) => o.id === found.restaurant_id);
    store = { restaurant_id: found.restaurant_id, name: found.name, campus: ops?.campus ?? null };
  } else {
    const name = sponsorStores(plan.topic, pap.sponsorships).find((n) => normName(n) === normName(sponsorName));
    if (!name) return NextResponse.json({ detail: "이 게시물의 협찬 매장이 아닙니다." }, { status: 404 });
    store = { restaurant_id: null, name, campus: null };
  }

  const snapshot = await buildSnapshot(store, plan, stores.filter((s) => s.is_affiliate !== false));
  snapshot.cohort_note = cohortNote(snapshot.metrics);
  const usedRules = mine.filter((r) => r.status === "SENT").flatMap((r) => r.proposals.filter((p) => p.approved).map((p) => p.rule));
  const actor = (await actorName()) ?? "unknown";
  const now = new Date().toISOString();

  let report: StoreReport;
  try { report = await createReport({
    id: `rep-${Date.now()}`,
    token: null, restaurant_id: store.restaurant_id, plan_id: plan.id, kind: "post", status: "DRAFT",
    title: `${store.name} 인스타그램 홍보 성과`,
    // 점주 문장 — 우리 채널과 견주지 않는다(0925). 채널 비교는 cohort_note · 제안 근거 줄(내부)에만.
    summary: ownerHeadline(snapshot),
    interpretation: ownerStory(snapshot),
    snapshot, proposals: propose(snapshot, usedRules),
    created_by: actor, created_at: now, approved_by: null, approved_at: null, linked_at: null, sent_at: null, revoked_at: null,
    views: { count: 0, first_at: null, last_at: null },
  }); } catch (e) { return storeError(e) ?? NextResponse.json({ detail: "리포트를 저장하지 못했습니다." }, { status: 502 }); }
  return NextResponse.json({ report, ...draftNote() }, { status: 201 });
}
