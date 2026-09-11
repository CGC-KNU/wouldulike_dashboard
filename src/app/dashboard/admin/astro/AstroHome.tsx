"use client";

import Calendar, { buildEvents } from "./Calendar";
import { useEffect, useMemo, useState } from "react";
import { IconBrandSlack, IconExternalLink } from "@tabler/icons-react";
import { LEAD_STAGES, isPaidTier, type Activity, type Lead, type StoreRow } from "@/lib/draft/types";
import { SALES_SHEET, TOOLS, slackUrl } from "@/lib/satellite";
import { Button, Card, Chip, Empty, Kpi, PageHeader, Skeleton, agoLabel, daysSince, type ChipTone, periodLocal } from "../_shared/ui";

/**
 * Astro · 홈. Pitchr 대시보드를 따랐다 — 상단 "지금 막힌 것" KPI, 파이프라인 요약(단계별 막대), 최근 기록.
 * 영업이 아침에 여기만 보고 오늘 할 일을 고를 수 있어야 한다. 총합 숫자는 여기 없다.
 */

const STAGE_TONE: Record<string, ChipTone> = {
  미컨택: "gray", "컨택 중": "blue", "미팅 조율": "blue", "미팅 예정": "navy", "미팅 완료": "navy", "구두 합의": "amber", "계약 완료": "green",
};

export default function AstroHome({ onGo }: { onGo: (tab: string) => void }) {
  const [stores, setStores] = useState<StoreRow[] | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [acts, setActs] = useState<Activity[] | null>(null);
  const [ym, setYm] = useState(periodLocal());
  const [invoices, setInvoices] = useState<{ restaurant_id: number; paid_at: string | null; status: string }[] | null>(null);

  useEffect(() => {
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    j("/api/astro/stores").then((d) => setStores(d?.stores ?? []));
    j("/api/astro/leads").then((d) => setLeads(d?.leads ?? []));
    j("/api/astro/activities").then((d) => setActs(d?.activities ?? []));
    j(`/api/astro/invoices?period=${periodLocal()}`).then((d) => setInvoices(d?.invoices ?? []));
  }, []);

  const loading = !stores || !leads;
  const paid = useMemo(() => (stores ?? []).filter((s) => s.is_affiliate && isPaidTier(s.tier) && !s.ops?.is_test), [stores]);
  // 매장 현황·입금 현황과 같은 기준: 월납은 이번 달 계산서 입금, 일시납만 매장 상태값
  const paidIds = new Set((invoices ?? []).filter((i) => i.paid_at && !["CANCELED", "REJECTED"].includes(i.status)).map((i) => i.restaurant_id));
  const unpaid = paid.filter((s) => s.ops?.billing !== "EXEMPT" && (s.ops?.pay_cycle === "LUMP" ? s.ops?.billing !== "PAID" : !paidIds.has(s.restaurant_id)));
  const noReply = paid.filter((s) => s.ops?.invoice === "NO_REPLY");
  const active = (leads ?? []).filter((l) => !["재컨택", "보류", "거절"].includes(l.stage));
  const stale = active.filter((l) => l.stage !== "계약 완료" && (daysSince(l.last_touch_at) ?? 0) >= 7);
  const due = active.filter((l) => l.due).slice(0, 6);
  const byStage = LEAD_STAGES.map((s) => ({ stage: s, n: active.filter((l) => l.stage === s).length }));
  const max = Math.max(1, ...byStage.map((b) => b.n));
  const astro = TOOLS.astro;

  return (
    <>
      <PageHeader
        title="영업 홈"
        description="오늘 처리할 것부터. 숫자를 누르면 해당 화면으로 갑니다."
        actions={
          <>
            <a href={SALES_SHEET.url(0)} target="_blank" rel="noreferrer">
              <Button icon={<IconExternalLink />}>팀 시트</Button>
            </a>
            <a href={slackUrl(astro)} target="_blank" rel="noreferrer">
              <Button icon={<IconBrandSlack />}>#{astro.slack.channel}</Button>
            </a>
          </>
        }
      />

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <Kpi label="입금 미확인" value={loading ? "-" : unpaid.length} tone="alert" hint="유료 매장 중" onClick={() => onGo("astro-billing")} />
        <Kpi label="계산서 미회신" value={loading ? "-" : noReply.length} tone="alert" hint="다시 연락할 차례" onClick={() => onGo("astro-billing")} />
        <Kpi label="7일 이상 멈춘 후보" value={loading ? "-" : stale.length} tone="alert" hint="기록이 없는 곳" onClick={() => onGo("astro-leads")} />
        <Kpi label="진행 중 후보" value={loading ? "-" : active.length} hint={`유료 매장 ${paid.length}곳`} onClick={() => onGo("astro-leads")} />
      </div>

      {/* 일정 — 홈에서 제일 먼저 보이게 (민열님 0911 "캘린더 잘 안 보임"). 같은 날 여러 건은 종류별로 묶어 글자로 쓴다. */}
      <Card title="일정" description="미팅·기한은 후보에서, 계약 시작·입금 예정은 파트너 매장에서 옵니다. 입금 예정일은 계약 시작일의 '일'을 매달 반복하고, 청구 시작 월 전에는 뜨지 않습니다." className="mb-5">
        {loading ? <Skeleton rows={5} cols={7} /> : <Calendar ym={ym} onMonth={setYm} events={buildEvents(stores ?? [], leads ?? [], ym, (id) => onGo(`astro-ops?open=${id}`), (id) => onGo(`astro-leads?open=${id}`))} />}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
        <Card title="파이프라인" description="단계별 후보 수. 왼쪽이 두꺼우면 연락이 밀린 것이고, 오른쪽이 두꺼우면 계약이 몰린 것입니다." actions={<Button size="sm" variant="ghost" onClick={() => onGo("astro-leads")}>보드로</Button>}>
          {loading ? (
            <Skeleton rows={7} cols={2} />
          ) : active.length === 0 ? (
            <Empty title="아직 후보가 없습니다" detail="파트너 후보 화면에서 '시트에서 불러오기'를 누르면 팀 시트의 후보가 들어옵니다." action={<Button variant="primary" onClick={() => onGo("astro-leads")}>파트너 후보로</Button>} />
          ) : (
            <ol className="space-y-2">
              {byStage.map((b) => (
                <li key={b.stage} className="grid grid-cols-[6rem_minmax(0,1fr)_2.5rem] items-center gap-3">
                  <Chip tone={STAGE_TONE[b.stage]}>{b.stage}</Chip>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-navy/70 rounded-full" style={{ width: `${(b.n / max) * 100}%` }} />
                  </div>
                  <span className="text-[13px] font-semibold text-gray-800 tabular-nums text-right">{b.n}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="캠퍼스별" description="파트너 매장 · 진행 중 후보.">
            {loading ? <Skeleton rows={3} cols={3} /> : (
              <ul className="divide-y divide-gray-100">
                {(["경북대", "영남대", "계명대"] as const).map((c) => {
                  const st = (stores ?? []).filter((s) => s.is_affiliate && (s.ops?.campus ?? "경북대") === c);
                  const ld = active.filter((l) => (l.campus ?? "경북대") === c);
                  return (
                    <li key={c} className="flex items-center gap-3 py-2 text-[13px]">
                      <span className="flex-1 font-semibold text-gray-900">{c}</span>
                      <span className="text-gray-500">파트너 <span className="font-semibold text-gray-900 tabular-nums">{st.length}</span> (유료 {st.filter((s) => isPaidTier(s.tier)).length})</span>
                      <span className="text-gray-500">후보 <span className="font-semibold text-gray-900 tabular-nums">{ld.length}</span></span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card title="기한이 있는 것" description="시트 '기한' 열 기준.">
            {loading ? (
              <Skeleton rows={4} cols={2} />
            ) : due.length === 0 ? (
              <p className="text-[13px] text-gray-500">기한이 적힌 후보가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {due.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2">
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold text-gray-900 truncate">{l.name}</span>
                      <span className="block text-[12px] text-gray-500 truncate">{l.next_action ?? l.stage}</span>
                    </span>
                    <span className="text-[12px] font-semibold text-gray-700 tabular-nums">{l.due}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="최근 기록" description="매장·후보에 남긴 메모·전화·미팅.">
            {!acts ? (
              <Skeleton rows={4} cols={2} />
            ) : acts.length === 0 ? (
              <p className="text-[13px] text-gray-500">아직 기록이 없습니다. 매장이나 후보를 열면 아래에 기록 칸이 있습니다.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {acts.slice(0, 6).map((a) => (
                  <li key={a.id} className="py-2">
                    <p className="text-[13px] text-gray-800 line-clamp-2">{a.body}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{a.kind} · {a.author} · {agoLabel(a.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

    </>
  );
}
