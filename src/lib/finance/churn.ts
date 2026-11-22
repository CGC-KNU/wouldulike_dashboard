import { fetchBackendJson } from "../draft/toolProxy";
import { remoteSend, remoteGet } from "../draft/remote";
import type { BackendRestaurant, StoreOps } from "../draft/types";
import { CHURN_REASONS, type ChurnReason } from "./types";

/**
 * 해지 기록(1122) — 계약 종료 때 사유와, 해지 뒤엔 다시 셀 수 없는 유료 시작 월 · 플랜을 백엔드 astro:churn 에 한 줄.
 * 종료일 자체는 운영값 contract_ends_on 에 이미 남는다(그 칸을 재사용). 이 기록이 3개월 유지율 · 이탈의 분자다.
 * 계약 종료를 막지 않는다 — 실패하면 결과만 돌려준다(종료는 이미 됐다).
 */
export const isChurnReason = (v: unknown): v is ChurnReason => (CHURN_REASONS as string[]).includes(v as string);

export async function recordChurn(rid: number, reason: ChurnReason, endedOn: string): Promise<boolean> {
  const [ops, list] = await Promise.all([
    remoteGet<{ ops: StoreOps | null }>(`/api/astro/stores/${rid}/`),
    fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/", "include_inactive=1"),
  ]);
  const o = ops.ok ? ops.data?.ops : null;
  const start = o?.billing_start_period || (o?.contract_started_on ? o.contract_started_on.slice(0, 7) : null);
  const tier = list?.restaurants?.find((r) => r.restaurant_id === rid)?.tier ?? null;
  const r = await remoteSend("POST", "/api/astro/churn/", { restaurant_id: rid, reason, ended_on: endedOn, start, tier });
  return r.ok;
}
