import { normName } from "@/lib/draft/sheet";
import type { StoreReport } from "@/lib/draft/types";

/**
 * 7일차 리포트가 나간 뒤 권장 시점이 14일차로 바뀌었다(1008). 그때 이미 나간 매장 중 14일차 리포트를 다시 내기로 한 곳(1021).
 * 이 매장의 7일차 시점 리포트는 「이미 있음」으로 세지 않아, 14일차 초안·「리포트 만들 때」에 다시 오른다.
 * 14일차 이후 시점 리포트가 있으면 평소처럼 「이미 있음」이다.
 */
const REFRESH_AT_D14 = ["정든밤", "다이와스시"].map(normName);

export function isD7ReportToRefresh(r: Pick<StoreReport, "snapshot">, storeName: string): boolean {
  const n = normName(storeName);
  if (!REFRESH_AT_D14.some((x) => n === x || n.includes(x))) return false;
  const age = r.snapshot?.age_days;
  return typeof age === "number" && age < 14;
}
