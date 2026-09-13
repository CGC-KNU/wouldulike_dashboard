"use client";

import { useEffect, useState } from "react";
import { periodLocal } from "./ui";

/**
 * 세틀라이트 전체 현황 — 런처의 현황 카드·최근 목록, 셸 사이드바 배지가 같은 숫자를 본다 (애딧 대행사 대시보드 차용).
 * 각 API 를 한 번씩 가볍게 찌른다. 못 읽으면 그 칸은 undefined — 0 을 지어내지 않는다.
 */
export interface SatelliteStatus {
  stores?: { total: number; paid: number; recent: { id: number; name: string; tier: string | null; campus: string | null; signed: string | null; updated: string | null }[] };
  leads?: { active: number; meetings: number; stale: number; recent: { id: string; name: string; stage: string; owner: string | null; at: string | null }[] };
  billing?: { period: string; billed: number; paid: number; unpaid: number; pendingApprove: number; rows: { id: string; name: string; total: number; status: string; paid_at: string | null }[] };
  reports?: { draft: number; linked: number; sent: number; viewed: number };
  probe?: { high: number; due: number; held: number };
  activities?: { id: string; body: string; kind: string; author: string; at: string }[];
}

export function useSatelliteStatus(enabled = true): SatelliteStatus | null {
  const [st, setSt] = useState<SatelliteStatus | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const period = periodLocal();
    Promise.all([j("/api/astro/stores"), j("/api/astro/leads"), j(`/api/astro/invoices?period=${period}`), j("/api/probe/reports"), j("/api/probe/quality"), j("/api/probe/insights"), j("/api/probe/mileage"), j("/api/astro/activities")]).then(
      ([stores, leads, inv, reps, quality, ins, mil, acts]) => {
        const out: SatelliteStatus = {};
        type S = { restaurant_id: number; name: string; tier: string | null; is_affiliate: boolean; ops: { billing?: string; pay_cycle?: string | null; is_test?: boolean; campus?: string | null; contract_signed_on?: string | null; updated_at?: string | null } | null };
        if (stores?.stores) {
          const all = (stores.stores as S[]).filter((s) => s.is_affiliate && !s.ops?.is_test);
          const paid = all.filter((s) => s.tier === "BOOST" || s.tier === "CONTENT");
          const paidIds = new Set(((inv?.invoices ?? []) as { restaurant_id: number; paid_at: string | null; status: string }[]).filter((i) => i.paid_at && !["CANCELED", "REJECTED"].includes(i.status)).map((i) => i.restaurant_id));
          const unpaid = paid.filter((s) => s.ops?.billing !== "EXEMPT" && (s.ops?.pay_cycle === "LUMP" ? s.ops?.billing !== "PAID" : !paidIds.has(s.restaurant_id))).length;
          const recent = [...all].sort((a, b) => (b.ops?.contract_signed_on ?? b.ops?.updated_at ?? "").localeCompare(a.ops?.contract_signed_on ?? a.ops?.updated_at ?? "")).slice(0, 5).map((s) => ({ id: s.restaurant_id, name: s.name, tier: s.tier, campus: s.ops?.campus ?? null, signed: s.ops?.contract_signed_on ?? null, updated: s.ops?.updated_at ?? null }));
          out.stores = { total: all.length, paid: paid.length, recent };
          const rows = ((inv?.invoices ?? []) as { id: string; name: string; total: number; status: string; paid_at: string | null }[]).filter((i) => !["CANCELED", "REJECTED"].includes(i.status));
          out.billing = { period, billed: rows.length, paid: rows.filter((r) => r.paid_at).length, unpaid, pendingApprove: rows.filter((r) => r.status === "PENDING").length, rows: rows.slice(0, 5) };
        }
        if (leads?.leads) {
          type L = { id: string; name: string; stage: string; owner: string | null; last_touch_at: string | null; created_at?: string | null };
          const ls = leads.leads as L[];
          const active = ls.filter((l) => !["재컨택", "보류", "거절"].includes(l.stage));
          out.leads = {
            active: active.length,
            meetings: active.filter((l) => l.stage === "미팅 조율" || l.stage === "미팅 예정").length,
            stale: active.filter((l) => l.stage !== "계약 완료" && l.last_touch_at && Date.now() - Date.parse(l.last_touch_at) > 7 * 86_400_000).length,
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
