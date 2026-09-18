"use client";

import { useEffect, useState } from "react";
import { buildEvents, type CalEvent, type CalKind } from "../astro/Calendar";
import type { Lead, StoreRow, TaxInvoice } from "@/lib/draft/types";
import type { SpotJob } from "@/lib/draft/spot";
import type { CampaignWeek } from "@/lib/draft/campaigns";
import { fetchJson } from "./fetchJson";

/**
 * 이번 주에 걸린 일 — 런처 왼쪽 칸 (민열님 0919).
 *
 * 한 주는 **월요일~일요일**이다. 일요일 시작으로 잡으면 주말에 연 사람이 "이번 주"를
 * 다른 뜻으로 읽는다.
 *
 * 날짜를 어디서 읽을지는 **달력과 같은 규칙(buildEvents)** 을 그대로 쓴다. 여기서 따로
 * 세면 달력엔 있는데 런처엔 없는 일이 생기고, 그때부터 둘 다 안 믿게 된다.
 * 주가 달을 넘어가면(9/28~10/4) 두 달치를 불러 합친다.
 *
 * 게시물 업로드만 Papillon 쪽이라 따로 읽는다 — 달력이 보는 표에는 콘텐츠 기획이 없다.
 */

/** 런처에 내보일 종류. 나머지(계산서 품의·승인 같은 절차)는 여기서 뺀다 — 주간 요약에 넣을 일이 아니다. */
const SHOWN: CalKind[] = [
  "meeting", "spot_meeting", "spot_shoot", "due", "spot_due",
  "contract", "contract_end", "payment", "signed", "spot_plan", "spot_done",
];

export interface WeekIssue {
  date: string;
  kind: CalKind | "post";
  label: string;
  at?: string;
  campus?: string | null;
  sub?: string;
  go?: string;
}

export interface WeekIssues {
  from: string;
  to: string;
  items: WeekIssue[];
  /** 이번 주에 걸쳐 있는 캠페인 주간(마일리지 2배·한정쿠폰). */
  campaigns: CampaignWeek[];
  loading: boolean;
  /** 매장·후보 목록을 못 읽었다 — "일정 없음"이 아니라 "모름"이다. */
  failed: boolean;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 이번 주 월요일~일요일. */
export function weekRange(base = new Date()): { from: string; to: string } {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const mondayOffset = (d.getDay() + 6) % 7; // 일=6, 월=0
  const mon = new Date(d);
  mon.setDate(d.getDate() - mondayOffset);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { from: iso(mon), to: iso(sun) };
}

export function useWeekIssues(enabled = true): WeekIssues {
  const { from, to } = weekRange();
  const [state, setState] = useState<{ items: WeekIssue[]; campaigns: CampaignWeek[]; loading: boolean; failed: boolean }>({
    items: [], campaigns: [], loading: true, failed: false,
  });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    // 백엔드가 식어 있으면 첫 요청이 늦다 — 오래 기다리고 한 번 더 찌른다 (fetchJson 주석). 그래도 못 읽으면 failed.
    const j = (u: string) => fetchJson<Record<string, unknown>>(u);

    Promise.all([
      j("/api/astro/stores"), j("/api/astro/leads"), j("/api/astro/spots"),
      j(`/api/astro/invoices?period=${from.slice(0, 7)}`), j("/api/astro/campaigns"),
      j("/api/satellite/plans/quick-list?status=active"),
    ]).then(([stores, leads, spots, inv, camp, plans]) => {
      if (!alive) return;

      const weeks = (camp?.campaigns ?? []) as CampaignWeek[];
      const noop = () => {};
      const months = [...new Set([from.slice(0, 7), to.slice(0, 7)])];
      const events: CalEvent[] = months.flatMap((ym) =>
        buildEvents(
          (stores?.stores ?? []) as StoreRow[],
          (leads?.leads ?? []) as Lead[],
          ym, noop, noop,
          (inv?.invoices ?? []) as TaxInvoice[], noop,
          (spots?.spots ?? []) as SpotJob[], noop,
          [],   // 캠페인 주간은 7일 내내 찍혀 목록을 덮는다 — 아래에서 띠로 따로 보여 준다
        )
      );

      const items: WeekIssue[] = events
        .filter((e) => SHOWN.includes(e.kind) && e.date >= from && e.date <= to)
        .map((e) => ({
          date: e.date, kind: e.kind, label: e.label, at: e.at, campus: e.campus, sub: e.sub,
          go: goOf(e.kind),
        }));

      // 게시물 업로드 — Papillon 콘텐츠 기획의 업로드 예정일
      type P = { id: number; scheduled_date: string; topic: string; owner_name?: string | null; status?: string };
      for (const p of (plans?.plans ?? []) as P[]) {
        const d = (p.scheduled_date ?? "").slice(0, 10);
        if (!d || d < from || d > to) continue;
        items.push({
          date: d, kind: "post", label: p.topic || "(제목 미정)",
          sub: p.owner_name ? `업로드 · ${p.owner_name}` : "업로드",
          go: "satellite",
        });
      }

      items.sort((a, b) => a.date.localeCompare(b.date) || (a.at ?? "99:99").localeCompare(b.at ?? "99:99"));
      setState({
        items,
        campaigns: weeks.filter((w) => w.start <= to && w.end >= from),
        loading: false,
        failed: stores === null || leads === null,
      });
    });
    return () => { alive = false; };
  }, [enabled, from, to]);

  return { from, to, ...state };
}

/** 그 줄을 누르면 어디로 가는가. 없으면 안 눌린다. */
function goOf(kind: CalKind): string | undefined {
  if (kind === "meeting" || kind === "due") return "astro-leads";
  if (kind.startsWith("spot_")) return "astro-spots";
  if (kind === "payment") return "astro-billing";
  return "astro-ops";
}
