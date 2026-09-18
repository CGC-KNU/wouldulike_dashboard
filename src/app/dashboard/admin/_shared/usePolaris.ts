"use client";

import { useEffect, useState } from "react";
import { periodLocal } from "./ui";
import type { StoreRow, TaxInvoice, StoreMetric } from "@/lib/draft/types";
import type { PolarisInput } from "@/lib/polaris";

/**
 * Polaris 원자료 — 메인 현황 판이 읽는 것 (민열님 0919).
 *
 * 다섯 곳을 한 번씩 찌른다. 매장·계산서는 지금 있는 값, 앱 지표·매장 지표·인사이트는 Probe 다.
 * Probe 가 아직 못 주는 칸은 **undefined 로 둔다** — 0 이 아니다. 민찬이 붙이는 순간 채워진다.
 * 늦는 한 곳이 전체를 막지 않게 8초에서 끊는다 (useSatelliteStatus 와 같은 이유).
 */

export interface RecentPost {
  restaurant_id: number;
  store: string;
  topic: string;
  posted_at: string | null;
  permalink: string | null;
  checkpoint: "D2" | "D7" | "D14" | "done" | "waiting";
  plan_id: number;
  hasReport: boolean;
}

export interface TopStore { restaurant_id: number; name: string; coupon: number; stamp: number; revisit: number }

export interface PolarisData {
  input: PolarisInput;
  period: string;
  posts: RecentPost[];
  topStores: TopStore[] | undefined;
  unpaid: number;
  campuses: { campus: string; n: number }[];
  loading: boolean;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 계약 시작일이 그날 이전인 매장 수 — "n주 전엔 몇 곳이었나"를 지금 목록으로 되짚는다. 종료된 매장은 목록에 없어 약간 낮게 잡힌다. */
function countAsOf(rows: StoreRow[], cutoff: string, paidOnly: boolean): number | undefined {
  const dated = rows.filter((s) => s.ops?.contract_started_on || s.ops?.contract_signed_on);
  if (dated.length === 0) return undefined;
  return rows.filter((s) => {
    if (paidOnly && !(s.tier === "BOOST" || s.tier === "CONTENT")) return false;
    const d = (s.ops?.contract_started_on ?? s.ops?.contract_signed_on ?? "").slice(0, 10);
    return d && d <= cutoff;
  }).length;
}

export function usePolaris(enabled = true): PolarisData {
  const period = periodLocal();
  const prev = periodLocal(-1);
  const [d, setD] = useState<PolarisData>({
    input: { stores: { total: 0, paid: 0, totalAgo: {}, paidAgo: {} }, revenue: { paid: 0, billed: 0 }, app: {}, reach: {}, coupon: {} },
    period, posts: [], topStores: undefined, unpaid: 0, campuses: [], loading: true,
  });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const j = (u: string) => fetch(u, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

    Promise.all([
      j("/api/astro/stores"), j(`/api/astro/invoices?period=${period}`), j(`/api/astro/invoices?period=${prev}`),
      j("/api/probe/app"), j("/api/probe/overview"), j("/api/probe/insights"),
    ]).then(([stores, inv, invPrev, app, overview, ins]) => {
      if (!alive) return;
      const rows = ((stores?.stores ?? []) as StoreRow[]).filter((s) => s.is_affiliate && !s.ops?.is_test);
      const paidRows = rows.filter((s) => s.tier === "BOOST" || s.tier === "CONTENT");
      const now = new Date();
      const weekAgo = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 28));
      const monthStart = iso(new Date(now.getFullYear(), now.getMonth(), 1));

      const live = (list: TaxInvoice[]) => list.filter((i) => !["CANCELED", "REJECTED"].includes(i.status));
      const thisInv = live((inv?.invoices ?? []) as TaxInvoice[]);
      const prevInv = live((invPrev?.invoices ?? []) as TaxInvoice[]);
      const sum = (list: TaxInvoice[], paidOnly: boolean) => list.filter((i) => !paidOnly || i.paid_at).reduce((a, i) => a + (i.total ?? 0), 0);

      // 앱 지표 — probe/app 의 그룹/메트릭에서 키로 뽑는다. 값이 null 이면 undefined(연결 전).
      const metrics = new Map<string, number | null>();
      for (const g of (app?.groups ?? []) as { metrics: { key: string; value: number | null }[] }[]) for (const m of g.metrics) metrics.set(m.key, m.value);
      const num = (k: string) => { const v = metrics.get(k); return typeof v === "number" ? v : undefined; };

      const ov = (overview?.stores ?? []) as StoreMetric[];
      const topStores = overview ? ov.filter((s) => !s.unavailable && s.is_affiliate)
        .map((s) => ({ restaurant_id: s.restaurant_id, name: s.name, coupon: s.coupon_redeemed_this_month, stamp: s.stamp_earned_this_month, revisit: s.revisit_this_month }))
        .sort((a, b) => (b.coupon + b.stamp) - (a.coupon + a.stamp)).slice(0, 4) : undefined;

      type I = { restaurant_id: number; store: string; topic: string; posted_at: string | null; permalink: string | null; checkpoint: RecentPost["checkpoint"]; plan_id: number; report: string | null; sent_report: unknown };
      const posts = ((ins?.insights ?? []) as I[]).filter((x) => x.posted_at)
        .sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? "")).slice(0, 4)
        .map((x) => ({ restaurant_id: x.restaurant_id, store: x.store, topic: x.topic, posted_at: x.posted_at, permalink: x.permalink, checkpoint: x.checkpoint, plan_id: x.plan_id, hasReport: Boolean(x.report || x.sent_report) }));

      const campusMap = new Map<string, number>();
      for (const s of rows) { const c = s.ops?.campus ?? "경북대"; campusMap.set(c, (campusMap.get(c) ?? 0) + 1); }

      const paidIds = new Set(thisInv.filter((i) => i.paid_at).map((i) => i.restaurant_id));
      const unpaid = paidRows.filter((s) => s.ops?.billing !== "EXEMPT" && (s.ops?.pay_cycle === "LUMP" ? s.ops?.billing !== "PAID" : !paidIds.has(s.restaurant_id))).length;

      setD({
        input: {
          stores: { total: rows.length, paid: paidRows.length,
            totalAgo: { week: countAsOf(rows, weekAgo, false), month: countAsOf(rows, monthStart, false) },
            paidAgo: { week: countAsOf(rows, weekAgo, true), month: countAsOf(rows, monthStart, true) } },
          revenue: { paid: sum(thisInv, true), billed: sum(thisInv, false), paidPrevMonth: invPrev ? sum(prevInv, true) : undefined },
          app: { wau: num("wau"), dauWau: num("dau_wau"), openToStore: num("open_to_store"), retentionW1: num("retention_w1"), wauPrevWeek: undefined },
          reach: {},
          coupon: { rate: num("coupon_rate") },
        },
        period, posts, topStores, unpaid,
        campuses: [...campusMap].map(([campus, n]) => ({ campus, n })).sort((a, b) => b.n - a.n),
        loading: false,
      });
    });
    return () => { alive = false; };
  }, [enabled, period, prev]);

  return d;
}
