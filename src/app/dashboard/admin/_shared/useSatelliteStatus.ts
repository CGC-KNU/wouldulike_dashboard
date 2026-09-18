"use client";

import { useEffect, useState } from "react";
import { periodLocal } from "./ui";
import { fetchJson } from "./fetchJson";
import { LEAD_OPEN_STAGES } from "@/lib/draft/types";

/** 정가표 — 스팟 금액을 셀 때만 쓴다. 값을 적어 둔 건이면 그걸 우선한다(0원 = 무료도 적어 둔 값이다). */
const SPOT_PRICE: Record<string, number> = { CARD: 100_000, CARD_SHOOT: 150_000, REELS: 150_000, REELS_SHOOT: 200_000 };
const SPOT_ORDER = ["컨택", "미팅", "기획안", "계약", "촬영", "편집", "납품", "정산"] as const;

/**
 * 세틀라이트 전체 현황 — 런처의 현황 카드·최근 목록, 셸 사이드바 배지가 같은 숫자를 본다 (애딧 대행사 대시보드 차용).
 * 각 API 를 한 번씩 가볍게 찌른다. 못 읽으면 그 칸은 undefined — 0 을 지어내지 않는다.
 */
export interface SatelliteStatus {
  /** `byCampus` · `funnel` · `amount` · `weeks` 는 그림을 그리기 위한 묶음이다. 숫자 자체는 위 값들과 같은 원본에서 나온다. */
  stores?: { total: number; paid: number; byCampus: { campus: string; paid: number; free: number }[]; weeks: number[];
             recent: { id: number; name: string; tier: string | null; campus: string | null; signed: string | null; updated: string | null }[] };
  leads?: { active: number; meetings: number; stale: number; funnel: { stage: string; n: number }[]; side: number;
            recent: { id: string; name: string; stage: string; owner: string | null; at: string | null }[] };
  billing?: { period: string; billed: number; paid: number; unpaid: number; pendingApprove: number;
              amount: { billed: number; paid: number };
              rows: { id: string; name: string; total: number; status: string; paid_at: string | null }[] };
  spots?: { live: number; contracted: number; unpaidAmount: number; stages: { stage: string; n: number }[] };
  reports?: { draft: number; linked: number; sent: number; viewed: number };
  probe?: { high: number; due: number; held: number };
  activities?: { id: string; body: string; kind: string; author: string; at: string }[];
}

export function useSatelliteStatus(enabled = true): SatelliteStatus | null {
  const [st, setSt] = useState<SatelliteStatus | null>(null);
  useEffect(() => {
    if (!enabled) return;
    /**
     * 하나가 늦으면 **전부** 안 뜬다 — `Promise.all` 은 제일 느린 하나를 기다린다.
     * 실제로 그래서 현황 판이 통째로 안 나왔다 (0914). 응답이 8초를 넘기면 그 칸만 포기하고
     * 나머지로 그린다. 못 읽은 칸은 `undefined` 로 남아 화면에 "—" 로 뜬다 — 0 을 지어내지 않는다.
     */
    // 런처의 다른 훅과 같은 주소를 겹쳐 부르지 않게 fetchJson 을 같이 쓴다 (겹침·동시 3개·재시도 — 그 파일 주석)
    const j = (u: string) => fetchJson<Record<string, any>>(u); // eslint-disable-line @typescript-eslint/no-explicit-any
    const period = periodLocal();
    Promise.all([j("/api/astro/stores"), j("/api/astro/leads"), j(`/api/astro/invoices?period=${period}`), j("/api/probe/reports"), j("/api/probe/quality"), j("/api/probe/insights"), j("/api/probe/mileage"), j("/api/astro/activities"), j("/api/astro/spots")]).then(
      ([stores, leads, inv, reps, quality, ins, mil, acts, spots]) => {
        const out: SatelliteStatus = {};
        type S = { restaurant_id: number; name: string; tier: string | null; is_affiliate: boolean; ops: { billing?: string; pay_cycle?: string | null; is_test?: boolean; campus?: string | null; contract_signed_on?: string | null; contract_started_on?: string | null; updated_at?: string | null } | null };
        if (stores?.stores) {
          const all = (stores.stores as S[]).filter((s) => s.is_affiliate && !s.ops?.is_test);
          const paid = all.filter((s) => s.tier === "BOOST" || s.tier === "CONTENT");
          const paidIds = new Set(((inv?.invoices ?? []) as { restaurant_id: number; paid_at: string | null; status: string }[]).filter((i) => i.paid_at && !["CANCELED", "REJECTED"].includes(i.status)).map((i) => i.restaurant_id));
          const unpaid = paid.filter((s) => s.ops?.billing !== "EXEMPT" && (s.ops?.pay_cycle === "LUMP" ? s.ops?.billing !== "PAID" : !paidIds.has(s.restaurant_id))).length;
          const recent = [...all].sort((a, b) => (b.ops?.contract_signed_on ?? b.ops?.updated_at ?? "").localeCompare(a.ops?.contract_signed_on ?? a.ops?.updated_at ?? "")).slice(0, 5).map((s) => ({ id: s.restaurant_id, name: s.name, tier: s.tier, campus: s.ops?.campus ?? null, signed: s.ops?.contract_signed_on ?? null, updated: s.ops?.updated_at ?? null }));
          // 캠퍼스별 유료/무료 — 상권마다 어디까지 왔는지가 총량 하나보다 많은 걸 말한다
          const campuses = [...new Set(all.map((s) => s.ops?.campus ?? "경북대"))];
          const byCampus = campuses.map((c) => {
            const here = all.filter((s) => (s.ops?.campus ?? "경북대") === c);
            const p = here.filter((s) => s.tier === "BOOST" || s.tier === "CONTENT").length;
            return { campus: c, paid: p, free: here.length - p };
          }).sort((a, b) => (b.paid + b.free) - (a.paid + a.free));
          // 최근 8주 계약 시작 — 영업이 붙고 있는지 떨어지고 있는지는 총량으로 안 보인다
          const weeks = Array.from({ length: 8 }, () => 0);
          const now = Date.now();
          for (const s of all) {
            const d = s.ops?.contract_started_on ?? s.ops?.contract_signed_on;
            if (!d) continue;
            const t = Date.parse(`${String(d).slice(0, 10)}T00:00:00`);
            if (Number.isNaN(t)) continue;
            const w = Math.floor((now - t) / (7 * 86_400_000));
            if (w >= 0 && w < 8) weeks[7 - w] += 1;
          }
          out.stores = { total: all.length, paid: paid.length, byCampus, weeks, recent };
          const rows = ((inv?.invoices ?? []) as { id: string; name: string; total: number; status: string; paid_at: string | null }[]).filter((i) => !["CANCELED", "REJECTED"].includes(i.status));
          out.billing = { period, billed: rows.length, paid: rows.filter((r) => r.paid_at).length, unpaid,
            pendingApprove: rows.filter((r) => r.status === "PENDING").length,
            // 건수만으로는 이번 달에 얼마가 들어왔는지 모른다 — 금액도 같이 센다
            amount: { billed: rows.reduce((a, r) => a + (r.total ?? 0), 0), paid: rows.filter((r) => r.paid_at).reduce((a, r) => a + (r.total ?? 0), 0) },
            rows: rows.slice(0, 5) };
        }
        if (leads?.leads) {
          type L = { id: string; name: string; stage: string; owner: string | null; last_touch_at: string | null; created_at?: string | null };
          const ls = leads.leads as L[];
          const active = ls.filter((l) => !["재컨택", "보류", "거절"].includes(l.stage));
          out.leads = {
            active: active.length,
            meetings: active.filter((l) => l.stage === "미팅 조율" || l.stage === "미팅 예정").length,
            stale: active.filter((l) => l.stage !== "계약 완료" && l.last_touch_at && Date.now() - Date.parse(l.last_touch_at) > 7 * 86_400_000).length,
            // 단계별 인원 — 어디에 몰려 있는지가 '진행 후보 86' 한 숫자보다 훨씬 많은 걸 말한다
            funnel: LEAD_OPEN_STAGES.map((st) => ({ stage: st, n: active.filter((l) => l.stage === st).length })),
            side: ls.length - active.length,
            recent: [...active].sort((a, b) => (b.last_touch_at ?? b.created_at ?? "").localeCompare(a.last_touch_at ?? a.created_at ?? "")).slice(0, 5).map((l) => ({ id: l.id, name: l.name, stage: l.stage, owner: l.owner, at: l.last_touch_at ?? l.created_at ?? null })),
          };
        }
        if (reps?.reports) {
          const rs = reps.reports as { status: string; views: { count: number } }[];
          out.reports = { draft: rs.filter((r) => r.status === "DRAFT" || r.status === "APPROVED").length, linked: rs.filter((r) => r.status === "LINKED").length, sent: rs.filter((r) => r.status === "SENT").length, viewed: rs.filter((r) => r.status === "SENT" && r.views.count > 0).length };
        }
        if (quality?.counts || ins?.insights || mil?.rounds) {
          out.probe = { high: quality?.counts?.high ?? 0, due: ((ins?.insights ?? []) as { due?: boolean }[]).filter((i) => i.due).length, held: ((mil?.rounds ?? []) as { result: string }[]).filter((r) => r.result === "held").length };
        }
        if (spots?.spots) {
          type P = { stage: string; product: string | null; price: number | null; paid_at: string | null };
          const all = spots.spots as P[];
          const live = all.filter((x) => !["보류", "거절"].includes(x.stage));
          const contracted = live.filter((x) => ["계약", "촬영", "편집", "납품", "정산"].includes(x.stage));
          const amount = (x: P) => (typeof x.price === "number" && x.price >= 0 ? x.price : (SPOT_PRICE[x.product ?? ""] ?? 0));
          out.spots = {
            live: live.length,
            contracted: contracted.length,
            unpaidAmount: contracted.filter((x) => !x.paid_at).reduce((a, x) => a + amount(x), 0),
            stages: SPOT_ORDER.map((st) => ({ stage: st, n: live.filter((x) => x.stage === st).length })),
          };
        }
        if (acts?.activities) out.activities = (acts.activities as { id: string; body: string; kind: string; author: string; created_at: string }[]).slice(0, 6).map((a) => ({ id: a.id, body: a.body, kind: a.kind, author: a.author, at: a.created_at }));
        setSt(out);
      }
    );
  }, [enabled]);
  return st;
}

/** 사이드바 배지 — "지금 막힌 것" 만. 총량은 배지가 아니다. */
export function navBadges(st: SatelliteStatus | null): Record<string, number> {
  if (!st) return {};
  const b: Record<string, number> = {};
  if (st.leads?.stale) b["astro-leads"] = st.leads.stale;
  if (st.billing?.unpaid) b["astro-billing"] = st.billing.unpaid;
  if (st.billing?.pendingApprove) b["astro-tax"] = st.billing.pendingApprove;
  { const n = (st.reports ? st.reports.draft + st.reports.linked : 0) + (st.probe?.due ?? 0); if (n) b["probe-reports"] = n; }
  if (st.probe?.held) b["probe-mileage"] = st.probe.held;
  if (st.probe?.high) b["probe-quality"] = st.probe.high;
  return b;
}
