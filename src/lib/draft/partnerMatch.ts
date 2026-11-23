import { fixedPlanStores, isPartnerContent, mentions, partnerNames, sponsorStores } from "./papillon";
import type { BackendRestaurant } from "./types";

/**
 * 기획 제목 하나로 「어느 매장 게시물인가」 — 매장 리포트 목록(insights.ts)과 인스타 추이의 제휴 · 제휴 아님(1123)이 함께 쓴다.
 * 둘이 따로 규칙을 가지면 목록에 뜬 게시물이 추이에서는 「제휴 아님」으로 세는 일이 생긴다. 규칙을 바꾸면 여기 하나만.
 *
 * 잡히는 것 (0919 · 1001 · 1021):
 *  - 제목 괄호 「(정든밤 포함)」 — 괄호 안 이름을 매장 표에서 못 찾아도 빼지 않는다(「매장 미확인」 줄, by "marker", r null).
 *  - 괄호가 없어도 제목에 앱 제휴 매장 이름이 들어 있으면.
 *  - 「한정쿠폰 주 매장 쿠폰 혜택」처럼 정해 둔 묶음 제목 — 그 매장 전부.
 *  - 앱 매장이 하나도 안 맞으면 협찬 기록 이름 · 「<매장> 협찬」 꼴(앱 밖 협찬, by "sponsor").
 * 하나도 없으면 빈 목록 = 제휴 아님.
 */
export interface PlanStoreMatch {
  r: BackendRestaurant | null;
  label: string;
  by: "marker" | "name" | "sponsor";
}

export function matchPlanStores(
  topic: string | null | undefined,
  restaurants: BackendRestaurant[],
  sponsorships: { store_name: string }[],
): PlanStoreMatch[] {
  const t = topic ?? "";
  const out: PlanStoreMatch[] = [];
  const same = (name: string, r: BackendRestaurant) => mentions(name, r.name) || mentions(r.name, name);
  const marked = isPartnerContent(t);
  const names = partnerNames(t);
  const seen = new Set<number>();
  const add = (r: BackendRestaurant, by: PlanStoreMatch["by"]) => { if (!seen.has(r.restaurant_id)) { seen.add(r.restaurant_id); out.push({ r, label: r.name, by }); } };
  for (const r of restaurants) if (names.some((n) => same(n, r))) add(r, "marker");
  for (const r of restaurants) if (mentions(t, r.name)) add(r, marked ? "marker" : "name");
  // 제목에 이름이 없는 여러 매장 게시물 — 정해 둔 매장 전부. 앱에 없는 곳은 협찬 매장으로(리포트 가능, 앱 지표만 없다)
  const fixed = fixedPlanStores(t);
  if (fixed.length) {
    for (const r of restaurants) if (fixed.some((n) => same(n, r))) add(r, "name");
    for (const n of fixed) if (!restaurants.some((r) => same(n, r))) out.push({ r: null, label: n, by: "sponsor" });
    return out;
  }
  if (!marked) {
    if (seen.size === 0) for (const n of sponsorStores(t, sponsorships)) out.push({ r: null, label: n, by: "sponsor" });
    return out;
  }
  for (const n of names) if (!restaurants.some((r) => same(n, r))) out.push({ r: null, label: n, by: "marker" });
  if (names.length === 0 && seen.size === 0) out.push({ r: null, label: "제휴식당 (괄호에 이름 없음)", by: "marker" });
  return out;
}

/** 제휴 매장 게시물인가 — 기획이 없으면(제목 없음) 제휴 아님(민찬 1123). */
export function isPartnerPost(
  topic: string | null | undefined,
  restaurants: BackendRestaurant[],
  sponsorships: { store_name: string }[],
): boolean {
  return Boolean((topic ?? "").trim()) && matchPlanStores(topic, restaurants, sponsorships).length > 0;
}
