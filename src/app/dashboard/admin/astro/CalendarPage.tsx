"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import type { Lead, StoreRow, TaxInvoice } from "@/lib/draft/types";
import type { SpotJob } from "@/lib/draft/spot";
import { Button, Card, DraftBadge, Kpi, PageHeader, Skeleton, periodLocal } from "../_shared/ui";
import Calendar, { buildEvents } from "./Calendar";
import type { CampaignWeek } from "@/lib/draft/campaigns";

/**
 * Astro · 일정 — 사이드바 탭 (홈과 파트너 매장 사이, 민열님 0911).
 *
 * 네 곳에서 날짜를 모은다 — 파트너 후보(컨택·미팅·기한), 파트너 매장(견적서·계약서 회수·체결·시작·종료·입금 예정),
 * 세금계산서(입금 완료·발행·품의·승인), 스팟 제작(미팅·기획안 발송·촬영·납품 기한·납품).
 * 날짜 칸이 있으면 올라온다 (민열님 0914).
 * 종류와 식당으로 거르고, 입금·미팅은 그 자리에서 문자로 팔로업하며, 날짜 칸의 '+' 로 바로 등록한다.
 */

export default function CalendarPage({ actor, onGo }: { actor: string; onGo: (target: string) => void }) {
  const [stores, setStores] = useState<StoreRow[] | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [invoices, setInvoices] = useState<TaxInvoice[] | null>(null);
  const [spots, setSpots] = useState<SpotJob[] | null>(null);
  /** 마일리지 2배 · 한정쿠폰 주간. 고정 일정이라 백엔드가 표를 그대로 준다. */
  const [weeks, setWeeks] = useState<CampaignWeek[]>([]);
  const [draft, setDraft] = useState<{ on: boolean; note?: string }>({ on: false });
  const [ym, setYm] = useState(periodLocal());

  const load = useCallback(() => {
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    j("/api/astro/stores").then((d) => { setStores(d?.stores ?? []); setDraft({ on: Boolean(d?.draft), note: d?.draft_note }); });
    j("/api/astro/leads").then((d) => setLeads(d?.leads ?? []));
    j("/api/astro/invoices").then((d) => setInvoices(d?.invoices ?? []));
    j("/api/astro/spots").then((d) => setSpots(d?.spots ?? []));
    j("/api/astro/campaigns").then((d) => setWeeks(d?.campaigns ?? []));
  }, []);
  useEffect(load, [load]);

  const loading = !stores || !leads || !invoices || !spots;
  const events = useMemo(
    () => buildEvents(
      stores ?? [], leads ?? [], ym,
      (id) => onGo(`astro-ops?open=${id}`),
      (id) => onGo(`astro-leads?open=${id}`),
      invoices ?? [],
      () => onGo("astro-billing"),
      spots ?? [],
      (id) => onGo(`astro-spots?open=${id}`),
      weeks,
    ),
    [stores, leads, invoices, spots, weeks, ym, onGo]
  );
  const n = (k: string) => events.filter((e) => e.kind === k).length;
  // 아직 안 들어온 돈 + 이미 들어온 돈. 둘을 합쳐야 '이 달에 받을 돈'이 된다.
  const dueSum = events.filter((e) => e.kind === "payment").reduce((a, e) => a + (e.msg?.fee ?? 0), 0);
  const paidSum = events.filter((e) => e.kind === "paid").reduce((a, e) => a + (e.msg?.fee ?? 0), 0);
  const month = Number(ym.slice(5));

  return (
    <>
      <PageHeader
        title="일정"
        description="날짜 칸의 + 를 누르면 그 날로 미팅·기한·계약 시작을 바로 등록합니다. 값은 파트너 후보·파트너 매장의 같은 칸으로 들어갑니다."
        actions={<>{draft.on && <DraftBadge note={draft.note} />}<Button icon={<IconRefresh />} onClick={load}>다시 읽기</Button></>}
      />

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <Kpi label={`${month}월 남은 입금`} value={loading ? "-" : `${dueSum.toLocaleString()}원`} hint={loading ? undefined : `아직 ${n("payment")}곳 · 들어온 돈 ${paidSum.toLocaleString()}원`} onClick={() => onGo("astro-billing")} />
        <Kpi label="미팅" value={loading ? "-" : n("meeting")} hint="후보 카드의 미팅 일시" onClick={() => onGo("astro-leads")} />
        <Kpi label="기한" value={loading ? "-" : n("due")} tone={n("due") ? "alert" : "plain"} hint="후보 카드의 기한" onClick={() => onGo("astro-leads")} />
        <Kpi label="스팟 촬영" value={loading ? "-" : n("spot_shoot")} hint="촬영 일정이 잡힌 건" onClick={() => onGo("astro-spots")} />
      </div>

      <Card>
        {loading ? <Skeleton rows={6} cols={7} /> : <Calendar ym={ym} onMonth={setYm} actor={actor} onLogged={load} events={events} leads={leads ?? []} stores={stores ?? []} spots={spots ?? []} />}
      </Card>

      <p className="text-[12px] text-gray-500 mt-3 leading-relaxed">
        <span className="font-semibold text-gray-700">날짜가 적힌 것은 전부 올라옵니다</span> — 후보의 컨택·미팅·기한, 매장의 견적서 발송·계약서 회수·계약 체결·시작·종료, 청구의 입금 예정·입금 완료·계산서 발행, 스팟 제작의 미팅·기획안 발송·촬영·납품 기한·납품까지.
        계산서 품의·승인은 하루 안에 지나가는 절차라 처음엔 꺼 두었고, 칩 줄의 <span className="font-semibold text-gray-700">전부 보기</span>로 켭니다.
        마지막으로 손댄 시각 같은 기록은 일정이 아니라 흔적이라 올리지 않습니다.
      </p>
      <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">
        입금 예정일은 매장의 <span className="font-semibold text-gray-700">계약 시작일</span>의 &lsquo;일&rsquo;을 매달 반복합니다(대부분 1일). 월 중간에 들어온 매장은 파트너 매장 상세의 <span className="font-semibold text-gray-700">청구 시작 월</span>을 먼저 정하면 그 달부터 뜹니다.
        시트에서 읽어온 미팅 일시는 &ldquo;8/6(목) 14시&rdquo; 같은 자유 서식이라 날짜를 못 읽으면 조용히 빠집니다 — 지어내지 않습니다.
      </p>
    </>
  );
}
