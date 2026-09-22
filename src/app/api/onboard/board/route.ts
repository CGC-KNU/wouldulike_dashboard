import { NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { backendUrl, getAccessToken } from "@/lib/apiProxy";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { remoteGet } from "@/lib/draft/remote";
import type { BackendRestaurant, StoreOps } from "@/lib/draft/types";
import { tempPinFor } from "@/lib/onboard/token";
import { describe, diffStore, foldByStore, readLedger, type Folded } from "@/lib/onboard/reconcile";

/**
 * 계약 현황판 — **매장 추가 → 링크 발급 → 계약 → 반영** 한 사이클을 한 화면에서 본다.
 *
 * 상태를 저장하는 곳이 없다(온보딩 토큰은 무상태). 그래서 흔적으로 되짚는다:
 *
 *   임시 PIN 이 심겨 있다        → 링크를 냈고 점주가 아직 [0]도 안 지났다
 *                                 (점주가 [0]에서 자기 PIN 으로 바꾸는 순간 이 흔적은 사라진다)
 *   원장에 consent 줄이 있다     → 계약에 동의했다
 *   원장에 complete/revise 줄     → 등록을 마쳤다
 *   완료했는데 운영 값이 비어 있다 → 반영 대기 (reconcile)
 *
 * 원장(시트)은 느리다(4~21초). **이 화면에서만** 읽는다 — 점주 화면 경로에는 절대 두지 않는다.
 */

export type ContractStage = "미발급" | "대기" | "동의" | "완료" | "반영대기" | "종이계약";

export interface BoardRow {
  rid: number;
  name: string;
  campus: string | null;
  tier: string | null;
  fee: number | null;
  owner_phone: string | null;
  stage: ContractStage;
  /** 원장에서 읽은 시각 — 언제 일어난 일인지 */
  at: string | null;
  /** 반영대기일 때 무엇을 넣어야 하는지 */
  todo: string | null;
  /** 발급을 막는 이유 (운영 중인 매장의 PIN 등) */
  blocked: string | null;
}

const ORDER: Record<ContractStage, number> = { 반영대기: 0, 완료: 1, 동의: 2, 대기: 3, 미발급: 4, 종이계약: 5 };

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;

  const [backend, remote, ledger] = await Promise.all([
    fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/", "include_inactive=1", true),
    remoteGet<{ ops: StoreOps[] }>("/api/astro/stores/ops/"),
    readLedger().catch(() => []),
  ]);
  const ops = new Map<number, StoreOps>();
  if (remote.handled && remote.ok) for (const o of remote.data?.ops ?? []) ops.set(o.id, o);
  const folded = new Map<number, Folded>();
  for (const f of foldByStore(ledger)) folded.set(f.rid, f);

  // 매장 PIN 은 매장마다 한 번씩 물어야 한다 — 원장·운영행에 걸린 매장만 본다(전수 조회는 느리다).
  const need = new Set<number>([...folded.keys()]);
  for (const [rid, o] of ops) if (o.is_test !== true && (o.contract_started_on || o.monthly_fee || o.contract_signed_on)) need.add(rid);
  const admin = await getAccessToken();
  const pins = new Map<number, string | null>();
  await Promise.all([...need].map(async (rid) => {
    const r = await fetch(backendUrl("/api/dashboard/restaurant/", `restaurant_id=${rid}`), { headers: { Authorization: `Bearer ${admin}` }, cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const j = (await r.json().catch(() => ({}))) as { pin?: string | null };
    pins.set(rid, j.pin ?? null);
  }));

  const rows: BoardRow[] = [];
  for (const r of backend?.restaurants ?? []) {
    const rid = r.restaurant_id;
    const o = ops.get(rid) ?? null;
    if (o?.is_test) continue;
    const f = folded.get(rid);
    const inCycle = Boolean(f) || need.has(rid);
    if (!inCycle) continue;

    let stage: ContractStage;
    let at: string | null = null;
    let todo: string | null = null;
    if (f?.done) {
      at = f.done.at;
      const d = diffStore(f, o, r.tier ?? null, Boolean(r.is_affiliate));
      // 채울 것이 있을 때만 '반영대기' — 충돌만 있는 건 사람이 판단할 일이지 밀린 일이 아니다
      const pending = d && (Object.keys(d.fill).length || Object.keys(d.store).length || d.lead);
      stage = pending ? "반영대기" : "완료";
      todo = pending ? describe(d!) : null;
    } else if (f?.consent) {
      stage = "동의"; at = f.consent.at;
    } else if (pins.get(rid) && pins.get(rid) === tempPinFor(rid)) {
      stage = "대기";
    } else if (pins.get(rid)) {
      stage = "종이계약"; // PIN 이 이미 있다 = 온보딩 이전에 운영을 시작한 매장
    } else {
      stage = "미발급";
    }

    rows.push({
      rid, name: r.name, campus: o?.campus ?? null, tier: r.tier ?? null, fee: o?.monthly_fee ?? null,
      owner_phone: o?.owner_phone ?? null, stage, at, todo,
      blocked: stage === "종이계약" ? "이미 매장 PIN 이 있어 링크를 낼 수 없습니다 (손님 적립에 쓰이는 번호입니다)" : null,
    });
  }

  rows.sort((a, b) => ORDER[a.stage] - ORDER[b.stage] || (b.at ?? "").localeCompare(a.at ?? "") || a.name.localeCompare(b.name, "ko"));
  const count = rows.reduce((m, r) => ({ ...m, [r.stage]: (m[r.stage] ?? 0) + 1 }), {} as Record<string, number>);
  return NextResponse.json({ rows, count, ledger_on: Boolean(process.env.ONBOARD_GSHEET_URL) });
}
