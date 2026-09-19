import { fetchBackendJson, fetchBackendResult } from "./toolProxy";
import { normName } from "./sheet";
import type { ContentPlan, PostPerformance, Sponsorship } from "@/app/dashboard/admin/satellite/types";

/**
 * Papillon(마케팅) ↔ Astro/Probe 연결점.
 *
 * Papillon 은 매장 ID 를 모른다. 협찬은 `store_name`, 콘텐츠 기획은 `topic` 에 매장 이름이 글자로 들어간다.
 * 그래서 연결은 **이름 정규화 매칭**(sheet.ts 의 normName — 공백·괄호·지점명 제거)이다.
 * 정확한 FK 는 백엔드에 `Sponsorship.restaurant`/`ContentPlan.restaurant` 가 생겨야 한다(권장 반영사항에 적음).
 *
 * 백엔드를 못 읽으면 `reachable:false` 로 돌려준다. 빈 배열을 "홍보한 적 없음"으로 읽지 않게 하기 위해서다.
 */

export interface PapillonSlice {
  reachable: boolean;
  sponsorships: Pick<Sponsorship, "id" | "store_name" | "shoot_datetime" | "status" | "status_label" | "shoot_owner_name">[];
  plans: Pick<ContentPlan, "id" | "topic" | "scheduled_date" | "status" | "media_type" | "pipeline_stage_label" | "owner_name">[];
}

interface PlansResp { plans?: ContentPlan[]; sponsorships?: Sponsorship[] }

/** 최근 N 개월치 기획·협찬을 한 번에 읽는다 (월 단위 API 라 달마다 한 번). */
export async function fetchPapillonMonths(months = 3): Promise<{ reachable: boolean; plans: ContentPlan[]; sponsorships: Sponsorship[] }> {
  const now = new Date();
  const calls = Array.from({ length: months }, (_, k) => {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    return fetchBackendJson<PlansResp>("/api/satellite/plans/", `year=${d.getFullYear()}&month=${d.getMonth() + 1}`);
  });
  const results = await Promise.all(calls);
  if (results.every((r) => r === null)) return { reachable: false, plans: [], sponsorships: [] };
  const plans = new Map<number, ContentPlan>();
  const sps = new Map<number, Sponsorship>();
  for (const r of results) {
    for (const p of r?.plans ?? []) plans.set(p.id, p);
    for (const s of r?.sponsorships ?? []) sps.set(s.id, s);
  }
  return { reachable: true, plans: [...plans.values()], sponsorships: [...sps.values()] };
}

/** 매장 이름이 글자 안에 들어 있는지. 짧은 이름(2자 이하)은 오탐이 많아 정확 일치만 본다. */
export function mentions(text: string, storeName: string): boolean {
  const n = normName(storeName);
  if (!n) return false;
  const t = normName(text);
  return n.length <= 2 ? t === n : t.includes(n);
}

export function sliceForStore(all: Awaited<ReturnType<typeof fetchPapillonMonths>>, storeName: string): PapillonSlice {
  return {
    reachable: all.reachable,
    sponsorships: all.sponsorships
      .filter((s) => mentions(s.store_name, storeName) || mentions(storeName, s.store_name))
      .sort((a, b) => b.shoot_datetime.localeCompare(a.shoot_datetime))
      .map(({ id, store_name, shoot_datetime, status, status_label, shoot_owner_name }) => ({ id, store_name, shoot_datetime, status, status_label, shoot_owner_name })),
    plans: all.plans
      .filter((p) => mentions(p.topic, storeName))
      .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))
      .map(({ id, topic, scheduled_date, status, media_type, pipeline_stage_label, owner_name }) => ({ id, topic, scheduled_date, status, media_type, pipeline_stage_label, owner_name })),
  };
}

/**
 * 성과 + 못 읽은 이유. 403 은 세틀라이트 블라인드 규칙(리드가 아니면 본인 기획만) — "아직 발행 전"(404)과 다르다.
 */
export async function fetchPerformance(planId: number): Promise<{ perf: PostPerformance | null; denied: boolean; notPublished: boolean }> {
  const r = await fetchBackendResult<PostPerformance>(`/api/satellite/plans/${planId}/performance/`);
  return { perf: r.data, denied: r.status === 403, notPublished: r.status === 404 };
}

// ── 제휴식당 표시 "(… 포함)" ─────────────────────────────────────────────
//
// 마케팅팀 약속(아윤님 0916): 제휴식당 큐레이션 콘텐츠는 제목 끝 괄호에 "(정든밤 포함)" 처럼 적는다.
// 백엔드 #ops-partner 알림(satellite/services/partner_content.py)이 같은 규칙으로 게시물을 고른다 —
// 규칙을 바꾸면 둘 다 바꾼다. 슬랙에서 "7일 경과" 가 울린 게시물이 Probe 에도 떠야 한다.
const PARTNER_RE = /[(（]\s*([^()（）]*?)\s*포함\s*[)）]/g;
const GENERIC = new Set(["", "제휴식당", "제휴 식당", "제휴매장", "제휴 매장", "파트너", "파트너매장", "파트너 매장"]);

export function isPartnerContent(topic: string | null | undefined): boolean {
  return new RegExp(PARTNER_RE.source).test(topic ?? "");
}

/** 괄호 안에서 읽은 매장 이름들. 못 읽으면 빈 목록 — 그래도 제휴식당 콘텐츠다. */
export function partnerNames(topic: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (topic ?? "").matchAll(PARTNER_RE)) {
    for (const part of m[1].split(/[,·/]| 및 /)) {
      const name = part.trim();
      if (name && !GENERIC.has(name)) out.push(name);
    }
  }
  return out;
}
