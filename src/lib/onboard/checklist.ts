import { backendUrl, getAccessToken } from "@/lib/apiProxy";

/**
 * 사장님이 온보딩에서 **무엇을 등록했나** — 계약 탭 칩과 [상세] 팝업이 같이 쓴다 (민열님 0929:
 * "사진 등록했는지, 혜택 등록했는지 등 보기 쉽게, 무슨 값 기입했는지도 팝업으로").
 * 관리자 화면에서만 부른다 — 관리자 토큰으로 백엔드 네 곳을 한 번에 읽는다.
 */
export interface StoreChecklist {
  pin: boolean;
  photos: string[];
  stamp: { on: boolean; target: number | null; steps: { at: number; reward: string }[] };
  coupons: { title: string; subtitle: string }[];
  special: { title: string; subtitle: string; active?: boolean }[];
}

export async function readChecklist(rid: number): Promise<StoreChecklist> {
  const token = await getAccessToken();
  const get = (path: string, q: string) => fetch(backendUrl(path, q), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [info, stamp, gen, sp] = await Promise.all([
    get("/api/dashboard/restaurant/", `restaurant_id=${rid}`),
    get("/api/dashboard/stamp-rule/", `restaurant_id=${rid}`),
    get("/api/dashboard/restaurant-benefits/", `restaurant_id=${rid}&kind=GENERAL`),
    get("/api/dashboard/restaurant-benefits/", `restaurant_id=${rid}&kind=SPECIAL`),
  ]);
  const rule = (stamp?.rule ?? stamp?.stamp_rule ?? stamp) as { active?: boolean; config_json?: { cycle_target?: number; thresholds?: { stamps?: number; at?: number; reward?: string; label?: string; coupon_code?: string }[]; stamp_enabled?: boolean } } | null;
  const cfg = rule?.config_json ?? {};
  const list = (x: unknown) => (Array.isArray(x) ? x : Array.isArray((x as { results?: unknown[] })?.results) ? (x as { results: unknown[] }).results : []) as { title?: string; subtitle?: string; active?: boolean }[];
  return {
    pin: Boolean(info?.has_pin),
    photos: Array.isArray(info?.s3_image_urls) ? info.s3_image_urls : [],
    stamp: {
      on: Boolean(rule && rule.active !== false && cfg.stamp_enabled !== false && (cfg.thresholds?.length ?? 0) > 0),
      target: typeof cfg.cycle_target === "number" ? cfg.cycle_target : null,
      steps: (cfg.thresholds ?? []).map((t) => ({ at: Number(t.stamps ?? t.at ?? 0), reward: String(t.reward ?? t.label ?? t.coupon_code ?? "") })),
    },
    coupons: list(gen).map((b) => ({ title: b.title ?? "", subtitle: b.subtitle ?? "" })),
    special: list(sp).map((b) => ({ title: b.title ?? "", subtitle: b.subtitle ?? "", active: b.active })),
  };
}
