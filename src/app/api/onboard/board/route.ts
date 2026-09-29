import { NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { backendUrl, getAccessToken } from "@/lib/apiProxy";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { remoteGet } from "@/lib/draft/remote";
import type { BackendRestaurant, Lead, StoreOps } from "@/lib/draft/types";
import { tempPinFor } from "@/lib/onboard/token";
import { normName } from "@/lib/draft/sheet";
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

export type ContractStage = "후보" | "미발급" | "대기" | "동의" | "완료" | "반영대기" | "종이계약";

export interface BoardRow {
  /** 매장 번호. **후보만 있고 매장이 아직 없으면 null** — 그 행은 '매장 만들기' 부터다 (0928) */
  rid: number | null;
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
  /**
   * 파트너 후보에서 이어진 건이면 그 후보의 영업 단계(구두 합의 · 계약 완료 …).
   * 0928 민열님: 세 탭이 따로 놀았다 — 후보 탭은 "계약 완료" 인데 여기는 "미발급". 두 축을 한 줄에 놓는다.
   */
  lead_id: string | null;
  lead_stage: string | null;
}

/**
 * 본인 확인에 쓸 번호 — **휴대폰(01x)만** (0929).
 * 후보 카드의 '매장 전화'(0507·053 같은 유선)가 대표자 연락처 칸으로 흘러와 링크에 묶이면,
 * 사장님은 자기 휴대폰을 넣어도 영원히 [0]을 못 넘는다. 휴대폰이 없으면 null — 링크는 대조 없이 나간다.
 */
function pickMobile(...cands: (string | null | undefined)[]): string | null {
  for (const c of cands) { const d = (c ?? "").replace(/\D/g, ""); if (/^01\d{8,9}$/.test(d)) return d; }
  return null;
}

const ORDER: Record<ContractStage, number> = { 반영대기: 0, 완료: 1, 동의: 2, 대기: 3, 후보: 4, 미발급: 5, 종이계약: 6 };

export async function GET() {
  const deny = await requireTool("restaurants");
  if (deny) return deny;

  // 0929: 임시 PIN 폐지 — '링크를 냈다' 는 이제 발급 기록(활동 kind=링크발급)으로 안다.
  const issuedRes = remoteGet<{ activities: { target_type: string; target_id: string; kind: string; created_at: string }[] }>("/api/astro/activities/");
  const [backend, remote, ledger, leadsRes] = await Promise.all([
    fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/", "include_inactive=1", true),
    remoteGet<{ ops: StoreOps[] }>("/api/astro/stores/ops/"),
    readLedger().catch(() => []),
    remoteGet<{ leads: Lead[] }>("/api/astro/leads/"),
  ]);
  // 매장 ↔ 후보. 한 매장에 후보가 둘 이어져 있으면 단계가 앞선 쪽(계약 완료 > 구두 합의)을 쓴다.
  const RANK: Record<string, number> = { "계약 완료": 2, "구두 합의": 1 };
  const leadOf = new Map<number, Lead>();
  /**
   * 매장 번호로 안 이어진 구두 합의·계약 완료 후보. 이름이 같은 매장이 있으면 그 줄에 붙인다 —
   * 0928 실측: 88왕족발이 후보(계약 완료)와 매장(#329) 둘 다 있는데 서로 안 이어져 있어 두 줄로 떴다.
   * 이름으로 붙인 건 링크에 lid 가 실리므로 사장님이 온보딩을 마칠 때 정식으로 이어진다.
   */
  const unlinked = new Map<string, Lead>();
  if (leadsRes.handled && leadsRes.ok) {
    for (const l of leadsRes.data?.leads ?? []) {
      if (l.converted_restaurant_id) {
        const cur = leadOf.get(l.converted_restaurant_id);
        if (!cur || (RANK[l.stage] ?? 0) > (RANK[cur.stage] ?? 0)) leadOf.set(l.converted_restaurant_id, l);
      } else if (l.stage === "구두 합의" || l.stage === "계약 완료") {
        unlinked.set(normName(l.name), l);
      }
    }
    for (const r of backend?.restaurants ?? []) {
      const l = unlinked.get(normName(r.name));
      if (!l) continue;
      unlinked.delete(normName(r.name));
      if (!leadOf.has(r.restaurant_id)) leadOf.set(r.restaurant_id, l);
    }
  }
  const ops = new Map<number, StoreOps>();
  if (remote.handled && remote.ok) for (const o of remote.data?.ops ?? []) ops.set(o.id, o);
  const folded = new Map<number, Folded>();
  for (const f of foldByStore(ledger)) folded.set(f.rid, f);

  // 매장 PIN 은 매장마다 한 번씩 물어야 한다 — 원장·운영행에 걸린 매장만 본다(전수 조회는 느리다).
  const issuedAt = new Map<number, string>();
  const ir = await issuedRes;
  if (ir.handled && ir.ok) for (const a of ir.data?.activities ?? []) {
    if (a.kind !== "링크발급" || a.target_type !== "store") continue;
    const rid = Number(a.target_id); if (!rid) continue;
    if (!issuedAt.has(rid) || (issuedAt.get(rid)! < a.created_at)) issuedAt.set(rid, a.created_at);
  }
  const need = new Set<number>([...folded.keys(), ...issuedAt.keys()]);
  for (const [rid, o] of ops) if (o.is_test !== true && (o.contract_started_on || o.monthly_fee || o.contract_signed_on)) need.add(rid);
  // 후보에서 "계약·매장 탭으로 보내기" 를 누른 매장은 요금이 아직 없어도 사이클에 올라와야 한다 —
  // 그래야 보낸 사람이 여기서 바로 링크를 낼 수 있다. 종료(보류)된 후보는 제외.
  for (const [rid, l] of leadOf) if (l.stage === "구두 합의" || l.stage === "계약 완료") need.add(rid);
  /**
   * 0925: 예전에는 매장마다 PIN **값**을 읽어 와 우리가 심은 임시값과 비교했다.
   * PIN 을 해시로 저장하면서 값을 못 읽게 됐으므로, **비교를 서버에 맡긴다** —
   * 묶음으로 한 번에 물어본다(낱개 경로는 틀릴 때마다 무차별 시도로 세어서, 현황판을 열
   * 때마다 우리 계정이 잠긴다).
   *
   * 결과는 세 가지다: true = 우리 임시 PIN, false = 다른 PIN 이 걸려 있음, null = PIN 없음.
   */
  const admin = await getAccessToken();
  const isTemp = new Map<number, boolean | null>();
  if (need.size) {
    const r = await fetch(backendUrl("/api/dashboard/auth/check-pin-bulk/"), {
      method: "POST",
      headers: { Authorization: `Bearer ${admin}`, "Content-Type": "application/json" },
      body: JSON.stringify({ items: [...need].map((rid) => ({ restaurant_id: rid, pin: tempPinFor(rid) })) }),
      cache: "no-store",
    }).catch(() => null);
    if (r?.ok) {
      const j = (await r.json().catch(() => ({}))) as { results?: Record<string, boolean | null> };
      for (const [k, v] of Object.entries(j.results ?? {})) isTemp.set(Number(k), v);
    }
  }

  const rows: BoardRow[] = [];
  for (const r of backend?.restaurants ?? []) {
    const rid = r.restaurant_id;
    const o = ops.get(rid) ?? null;
    if (o?.is_test) continue;
    // 계약 종료(제휴 꺼짐)한 매장은 이 사이클에서 뺀다 — 파트너 매장 탭 '계약 종료' 칸이 그 자리다.
    // 안 빼면 이 탭의 '종료' 버튼을 눌러도 행이 그대로 남아 "안 됐나?" 가 된다.
    if (r.is_affiliate === false) continue;
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
    } else if (issuedAt.has(rid) || isTemp.get(rid) === true) {
      stage = "대기"; at = issuedAt.get(rid) ?? null;
    } else if (isTemp.get(rid) === false && (o?.contract_started_on || o?.contract_signed_on)) {
      stage = "종이계약"; // PIN 이 있고 계약도 적혀 있다 = 온보딩 이전에 운영을 시작한 매장
    } else if (isTemp.get(rid) === false) {
      // PIN 은 있는데 계약이 없다 = 온보딩 중에 사장님이 PIN 을 이미 바꿔 둔 매장(0928 이층). 링크를 다시 낼 수 있다.
      stage = "미발급";
      todo = "사장님이 PIN 을 바꿔 두셨습니다. 링크를 다시 내면 새 임시 PIN 으로 바뀌고, 사장님이 다시 정하십니다";
    } else {
      stage = "미발급";
    }

    const l = leadOf.get(rid) ?? null;
    rows.push({
      rid, name: r.name, campus: o?.campus ?? l?.campus ?? null, tier: r.tier ?? null, fee: o?.monthly_fee ?? null,
      owner_phone: pickMobile(o?.owner_phone, l?.contact, l?.phone), stage, at, todo,
      blocked: stage === "종이계약" ? "이미 매장 PIN 이 있어 링크를 낼 수 없습니다 (손님 적립에 쓰이는 번호입니다)" : null,
      lead_id: l?.id ?? null, lead_stage: l?.stage ?? null,
    });
  }

  /**
   * 0928 민열님: "후보 탭에서 구두 합의이거나 계약 완료인 매장은 다 계약 탭에 보이게" —
   * 아직 매장을 안 만든 후보도 여기 선다. 링크는 매장 번호가 있어야 나가므로, 이 행은
   * '매장 만들기' 가 다음 할 일이다. 누르면 convert 가 매장을 만들고 다음 새로고침부터 미발급 행이 된다.
   */
  if (leadsRes.handled && leadsRes.ok) {
    const tierOf = (plan: string | null) => { const p = (plan ?? "").toLowerCase(); return p.includes("boost") ? "BOOST" : p.includes("premium") || p.includes("content") ? "CONTENT" : p.includes("무료") || p.includes("free") ? "FREE" : null; };
    for (const l of unlinked.values()) {
      rows.push({
        rid: null, name: l.name, campus: l.campus ?? null, tier: tierOf(l.proposed_plan), fee: null,
        owner_phone: pickMobile(l.contact, l.phone), stage: "후보", at: l.last_touch_at ?? null,
        todo: "매장을 아직 안 만들었습니다 — 만들면 바로 링크를 낼 수 있습니다", blocked: null,
        lead_id: l.id, lead_stage: l.stage,
      });
    }
  }

  rows.sort((a, b) => ORDER[a.stage] - ORDER[b.stage] || (b.at ?? "").localeCompare(a.at ?? "") || a.name.localeCompare(b.name, "ko"));
  const count = rows.reduce((m, r) => ({ ...m, [r.stage]: (m[r.stage] ?? 0) + 1 }), {} as Record<string, number>);
  return NextResponse.json({ rows, count, ledger_on: Boolean(process.env.ONBOARD_GSHEET_URL) });
}
