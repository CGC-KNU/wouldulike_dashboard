import { NextRequest, NextResponse } from "next/server";
import { actorName, requireTool } from "@/lib/draft/guard";
import { appendDraftItem, readDraft } from "@/lib/draft/store";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import { fetchPapillonMonths } from "@/lib/draft/papillon";
import { buildSnapshot } from "@/lib/draft/snapshot";
import { cohortNote, interpret, propose, HEADLINE_ORDER, comparable } from "@/lib/draft/report";
import { seedStoreOps } from "@/lib/draft/seed";
import type { BackendRestaurant, StoreOps, StoreReport } from "@/lib/draft/types";

/**
 * Probe · 매장 리포트 (점주에게 보내는 공개 링크의 원본).
 *
 * 흐름: 만들기(스냅샷 고정) → 검토·문구 수정 → 승인(금지 표현 검사) → 링크 발급(토큰) → 카톡은 사람 → 열람.
 * 저장은 초안 저장소 `probe_reports` — **공유 링크는 몇 달을 살아야 하므로 이 저장소는 임시 거처다.** 백엔드 `StoreReport` 모델로 옮긴다(인계 문서).
 */

const KEY = "probe_reports";
const seed = (): StoreReport[] => [];

export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const status = req.nextUrl.searchParams.get("status");
  const rid = req.nextUrl.searchParams.get("restaurant_id");
  let list = readDraft<StoreReport[]>(KEY, seed);
  if (status) list = list.filter((r) => r.status === status);
  if (rid) list = list.filter((r) => r.restaurant_id === Number(rid));
  return NextResponse.json({ reports: list, draft: true, draft_note: "리포트는 초안 저장소에 있습니다. 공유 링크가 몇 달을 살아야 하므로 운영에서는 백엔드 테이블이 필요합니다." });
}

/** POST { restaurant_id, plan_id } — 지금 값으로 스냅샷을 굳힌 리포트 초안을 만든다. 같은 게시물·매장에 살아 있는 리포트가 있으면 새로 만들지 않는다. */
export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const body = (await req.json().catch(() => ({}))) as { restaurant_id?: number; plan_id?: number; force?: boolean };
  if (!body.restaurant_id || !body.plan_id) return NextResponse.json({ detail: "restaurant_id 와 plan_id 가 필요합니다." }, { status: 400 });

  const existing = readDraft<StoreReport[]>(KEY, seed).find((r) => r.restaurant_id === body.restaurant_id && r.plan_id === body.plan_id && r.status !== "REVOKED");
  if (existing && !body.force) return NextResponse.json({ detail: `이 게시물 리포트는 이미 있습니다 (${existing.status}). 갱신본을 만들려면 force 를 주세요.`, report: existing }, { status: 409 });

  const backend = await fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/");
  const stores = backend?.restaurants ?? (isPreview() ? previewRestaurants() : []);
  const store = stores.find((s) => s.restaurant_id === body.restaurant_id);
  if (!store) return NextResponse.json({ detail: "매장을 찾을 수 없습니다." }, { status: 404 });
  const pap = await fetchPapillonMonths(3);
  const plan = pap.plans.find((p) => p.id === body.plan_id);
  if (!plan) return NextResponse.json({ detail: "Papillon 기획을 찾을 수 없습니다 (백엔드 연결 확인)." }, { status: 404 });

  const ops = readDraft<StoreOps[]>("astro_store_ops", seedStoreOps).find((o) => o.id === store.restaurant_id);
  const snapshot = await buildSnapshot({ ...store, campus: ops?.campus ?? null }, plan, stores.filter((s) => s.is_affiliate !== false));
  snapshot.cohort_note = cohortNote(snapshot.metrics);
  const head = HEADLINE_ORDER.map((k) => snapshot.metrics.find((m) => m.key === k)).find(Boolean);
  const usedRules = readDraft<StoreReport[]>(KEY, seed).filter((r) => r.restaurant_id === store.restaurant_id && r.status === "SENT").flatMap((r) => r.proposals.filter((p) => p.approved).map((p) => p.rule));
  const actor = (await actorName()) ?? "unknown";
  const now = new Date().toISOString();

  const report = appendDraftItem<StoreReport>(KEY, seed, {
    id: `rep-${Date.now()}`,
    token: null, restaurant_id: store.restaurant_id, plan_id: plan.id, kind: "post", status: "DRAFT",
    title: `${store.name} 인스타그램 홍보 성과`,
    summary: head && comparable(head) ? interpret(head) : "인스타그램 수치와 같은 기간 앱에서 일어난 일을 정리했습니다.",
    interpretation: HEADLINE_ORDER.map((k) => snapshot.metrics.find((m) => m.key === k)).filter((m): m is NonNullable<typeof m> => Boolean(m)).slice(0, 2).map(interpret),
    snapshot, proposals: propose(snapshot, usedRules),
    created_by: actor, created_at: now, approved_by: null, approved_at: null, linked_at: null, sent_at: null, revoked_at: null,
    views: { count: 0, first_at: null, last_at: null },
  });
  return NextResponse.json({ report, draft: true }, { status: 201 });
}
