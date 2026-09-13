import { fetchBackendJson } from "./toolProxy";
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

export async function fetchPerformance(planId: number): Promise<PostPerformance | null> {
  return fetchBackendJson<PostPerformance>(`/api/satellite/plans/${planId}/performance/`);
}
