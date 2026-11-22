import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/draft/guard";
import { remoteGet } from "@/lib/draft/remote";
import { readAffiliates } from "@/lib/finance/paidStores";
import type { CampusesDoc } from "@/lib/hubble";
import type { Lead } from "@/lib/draft/types";
import type { FinanceRecords, GoalsDoc, HubbleSummary, MetricsInputs } from "@/lib/finance/types";

/**
 * 재무 · 지표 입력 — 재무 현황의 지표 20개(1122)가 장부 말고 더 읽는 것을 한 번에.
 *   records  영업 시간 · 해지 · 플랜 변경 · 설정 · 계획값 · 시장 규모 (백엔드 /api/finance/records/ — 대표 둘만)
 *   goals    학기 목표 표(home:goals) — 다음 마일스톤
 *   funnel   후보 단계별 수 — 영업 깔때기
 *   free     제휴 중인 무료 매장 — 전환율 분모 · 상권 침투율(파트너)
 *   hubble   허블 상권 식당 수 합만 — 매장 원장은 싣지 않는다
 * 계획값 · 시장 규모는 실적 · 계획 숫자라 이 저장소(공개)에 두지 않는다. 못 읽은 것은 null — 0 이 아니다.
 */
const SCHOOLS: Record<string, string> = { 경북대: "경북대학교", 영남대: "영남대학교", 계명대: "계명대학교" };

export async function GET() {
  const deny = await requireFinance();
  if (deny) return deny;

  const [rec, goals, leads, aff, hub] = await Promise.all([
    remoteGet<FinanceRecords>("/api/finance/records/"),
    remoteGet<GoalsDoc>("/api/astro/goals/"),
    remoteGet<{ leads: Lead[] }>("/api/astro/leads/"),
    readAffiliates(),
    remoteGet<{ data: CampusesDoc | null }>("/api/dashboard/admin/hubble/campuses/"),
  ]);

  const funnel = leads.handled && leads.ok ? (leads.data?.leads ?? []).reduce<Record<string, number>>((m, l) => ((m[l.stage] = (m[l.stage] ?? 0) + 1), m), {}) : null;

  let hubble: HubbleSummary | null = null;
  const doc = hub.handled && hub.ok ? hub.data?.data : null;
  if (doc?.items?.length) {
    const bySido: Record<string, number> = {};
    for (const c of doc.items) bySido[c.sido] = (bySido[c.sido] ?? 0) + c.n;
    hubble = {
      campuses: Object.entries(SCHOOLS).map(([campus, school]) => ({ campus, n: doc.items.find((c) => c.name === school && c.branch === "본교")?.n ?? 0 })).filter((c) => c.n > 0),
      total: doc.items.reduce((a, c) => a + c.n, 0),
      count: doc.items.length,
      bySido,
    };
  }

  const body: MetricsInputs = {
    records: rec.handled && rec.ok ? rec.data : null,
    goals: goals.handled && goals.ok && goals.data?.columns ? goals.data : null,
    funnel,
    free: aff?.free ?? null,
    hubble,
    draft: !rec.handled,
  };
  return NextResponse.json(body);
}
