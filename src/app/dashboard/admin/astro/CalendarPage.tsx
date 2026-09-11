"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import type { Lead, StoreRow } from "@/lib/draft/types";
import { Button, Card, DraftBadge, Kpi, PageHeader, Skeleton, periodLocal } from "../_shared/ui";
import Calendar, { buildEvents } from "./Calendar";

/**
 * Astro · 일정 — 사이드바 탭 (홈과 파트너 매장 사이, 민열님 0911).
 *
 * 미팅 · 기한은 파트너 후보에서, 계약 시작 · 입금 예정은 파트너 매장에서 온다.
 * 종류와 식당으로 거르고, 입금·미팅은 그 자리에서 문자로 팔로업한다.
 */

export default function CalendarPage({ actor, onGo }: { actor: string; onGo: (target: string) => void }) {
  const [stores, setStores] = useState<StoreRow[] | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [draft, setDraft] = useState<{ on: boolean; note?: string }>({ on: false });
  const [ym, setYm] = useState(periodLocal());

  const load = useCallback(() => {
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    j("/api/astro/stores").then((d) => { setStores(d?.stores ?? []); setDraft({ on: Boolean(d?.draft), note: d?.draft_note }); });
    j("/api/astro/leads").then((d) => setLeads(d?.leads ?? []));
  }, []);
  useEffect(load, [load]);

  const loading = !stores || !leads;
  const events = useMemo(
    () => buildEvents(stores ?? [], leads ?? [], ym, (id) => onGo(`astro-ops?open=${id}`), (id) => onGo(`astro-leads?open=${id}`)),
    [stores, leads, ym, onGo]
  );
  const n = (k: string) => events.filter((e) => e.kind === k).length;
  const dueSum = events.filter((e) => e.kind === "payment").reduce((a, e) => a + (e.msg?.fee ?? 0), 0);
  const month = Number(ym.slice(5));

  return (
    <>
      <PageHeader
        title="일정"
        description="미팅·기한은 파트너 후보에서, 계약 시작·입금 예정은 파트너 매장에서 옵니다. 입금·미팅은 여기서 바로 문자로 이어집니다."
        actions={<>{draft.on && <DraftBadge note={draft.note} />}<Button icon={<IconRefresh />} onClick={load}>다시 읽기</Button></>}
      />

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <Kpi label={`${month}월 입금 예정`} value={loading ? "-" : `${dueSum.toLocaleString()}원`} hint={`${n("payment")}곳 · 월납만`} onClick={() => onGo("astro-billing")} />
        <Kpi label="미팅" value={loading ? "-" : n("meeting")} hint="후보 카드의 미팅 일시" onClick={() => onGo("astro-leads")} />
        <Kpi label="기한" value={loading ? "-" : n("due")} tone={n("due") ? "alert" : "plain"} hint="후보 카드의 기한" onClick={() => onGo("astro-leads")} />
        <Kpi label="계약 시작" value={loading ? "-" : n("contract")} hint="이 달에 시작한 파트너" onClick={() => onGo("astro-ops")} />
      </div>

      <Card>
        {loading ? <Skeleton rows={6} cols={7} /> : <Calendar ym={ym} onMonth={setYm} actor={actor} onLogged={load} events={events} />}
      </Card>

      <p className="text-[12px] text-gray-500 mt-3 leading-relaxed">
        입금 예정일은 매장의 <span className="font-semibold text-gray-700">계약 시작일</span>의 &lsquo;일&rsquo;을 매달 반복합니다(대부분 1일). 월 중간에 들어온 매장은 파트너 매장 상세의 <span className="font-semibold text-gray-700">청구 시작 월</span>을 먼저 정하면 그 달부터 뜹니다.
        시트에서 읽어온 미팅 일시는 &ldquo;8/6(목) 14시&rdquo; 같은 자유 서식이라 날짜를 못 읽으면 조용히 빠집니다 — 지어내지 않습니다.
      </p>
    </>
  );
}
