"use client";

import { useEffect, useMemo, useState } from "react";
import { IconArrowRight, IconBrandSlack, IconExternalLink } from "@tabler/icons-react";
import { LEAD_STAGES, isPaidTier, type Activity, type Lead, type StoreRow, type TaxInvoice } from "@/lib/draft/types";
import { BLOCKER_KIND_LABEL, buildBlockers, monthlyFromPlan, type BlockerKind } from "@/lib/draft/blockers";
import { SALES_SHEET, TOOLS, slackUrl } from "@/lib/satellite";
import { Button, Card, Chip, Empty, Kpi, PageHeader, Skeleton, agoLabel, daysSince, focusRing, todayLocal, type ChipTone, periodLocal } from "../_shared/ui";
import CampusMark from "./CampusMark";

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
  const [invoices, setInvoices] = useState<TaxInvoice[] | null>(null);
  /** 큐에서 종류로 거르기 — Pitchr 의 '전체 · 답장 · 리드 정리' 칩 줄과 같은 자리. */
  const [kind, setKind] = useState<BlockerKind | "all">("all");
  const [done, setDone] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    j("/api/astro/stores").then((d) => setStores(d?.stores ?? []));
    j("/api/astro/leads").then((d) => setLeads(d?.leads ?? []));
    j("/api/astro/activities").then((d) => setActs(d?.activities ?? []));
    j("/api/astro/invoices").then((d) => setInvoices(d?.invoices ?? []));
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
  /** 단계별 후보 수와 **월 합계** — Pitchr 파이프라인이 단계마다 금액을 달아 놓은 것을 옮겼다.
   *  금액은 제안 플랜 글자에서 숫자를 읽은 것만 센다. 플랜 이름만 있고 숫자가 없으면 '금액 미정'으로 따로 센다. */
  const byStage = LEAD_STAGES.map((st) => {
    const list = active.filter((l) => l.stage === st);
    const fees = list.map((l) => monthlyFromPlan(l.proposed_plan, l.campus));
    return { stage: st, n: list.length, won: fees.reduce<number>((a, f) => a + (f ?? 0), 0), unknown: fees.filter((f) => f === null).length };
  });
  const max = Math.max(1, ...byStage.map((b) => b.n));
  /** 금액이 적힌 제안 플랜이 하나도 없으면 칸을 아예 내지 않는다 — '금액 미정' 을 일곱 줄 세우면 잡음이다. */
  const showMoney = byStage.some((b) => b.won > 0);

  /** 지금 막힌 것 — 이유 한 줄과 버튼 하나. 처리하면 목록에서 사라진다. */
  const blockers = useMemo(
    () => buildBlockers(stores ?? [], leads ?? [], invoices ?? [], periodLocal(), todayLocal()),
    [stores, leads, invoices]
  );
  const queue = blockers.filter((b) => !done.includes(b.id) && (kind === "all" || b.kind === kind));
  const urgent = blockers.filter((b) => !done.includes(b.id) && b.rank <= 1).length;
  const kindCounts = (["money", "contract", "lead", "kit"] as BlockerKind[])
    .map((k) => ({ k, n: blockers.filter((b) => !done.includes(b.id) && b.kind === k).length }))
    .filter((x) => x.n > 0);
  const astro = TOOLS.astro;

  return (
    <>
      <PageHeader
        title="영업 홈"
        description="매출을 앞으로 움직이는 일부터. 처리하면 목록에서 사라집니다."
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


      {/* ── 지금 막힌 것 (애딧 Pitchr '오늘 끝내야 할 일' 차용, 민열님 0914)
             숫자만 보여 주면 "그래서 뭘 하지"가 남는다. 무엇이 없어서 안 굴러가는지 한 줄과 버튼 하나. */}
      <Card
        flush
        title="지금 막힌 것"
        description="무엇이 없어서 안 굴러가는지 적었습니다. 버튼을 누르면 그 일을 하는 화면으로 갑니다."
        className="mb-4"
        actions={
          loading ? null : (
            <span className="flex items-center gap-2">
              {urgent > 0 && <Chip tone="red" dot>급한 것 {urgent}</Chip>}
              <span className="text-[12px] text-gray-400 tabular-nums">{blockers.filter((b) => !done.includes(b.id)).length}건</span>
            </span>
          )
        }
      >
        {loading ? (
          <Skeleton rows={4} cols={2} />
        ) : blockers.length === 0 ? (
          <div className="px-5 py-6">
            <Empty title="막힌 것이 없습니다" detail="청구·계약서·비치물·후보 연락이 모두 제 자리에 있습니다." />
          </div>
        ) : (
          <>
            {kindCounts.length > 1 && (
              <div className="flex flex-wrap gap-1.5 px-4 pt-3">
                <button type="button" onClick={() => setKind("all")} aria-pressed={kind === "all"}
                  className={`h-7 px-2.5 rounded-full text-[12px] font-semibold border transition-colors ${focusRing} ${kind === "all" ? "bg-navy text-white border-navy" : "bg-white text-gray-600 border-black/[0.08] hover:border-navy/30"}`}>
                  전체 {blockers.filter((b) => !done.includes(b.id)).length}
                </button>
                {kindCounts.map(({ k, n }) => (
                  <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                    className={`h-7 px-2.5 rounded-full text-[12px] font-semibold border transition-colors ${focusRing} ${kind === k ? "bg-navy text-white border-navy" : "bg-white text-gray-600 border-black/[0.08] hover:border-navy/30"}`}>
                    {BLOCKER_KIND_LABEL[k]} {n}
                  </button>
                ))}
              </div>
            )}
            {queue.length === 0 ? (
              <p className="px-5 py-5 text-[13px] text-gray-500">이 종류는 다 처리했습니다.</p>
            ) : (
              <ul className="divide-y divide-gray-100 mt-2 max-h-[26rem] overflow-y-auto">
                {(showAll ? queue : queue.slice(0, 12)).map((b) => (
                  <li key={b.id} className={`flex items-start gap-3 px-4 py-3 border-l-2 ${b.rank <= 1 ? "border-l-red-400" : b.rank <= 2 ? "border-l-amber-400" : "border-l-transparent"}`}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-[13px] font-semibold text-gray-900">{b.name}</span>
                        {b.note && <span className="text-[11px] text-gray-400">{b.note}</span>}
                      </span>
                      <span className="block text-[12px] text-gray-600 mt-0.5 leading-snug">{b.why}</span>
                    </span>
                    <Button size="sm" icon={<IconArrowRight />} onClick={() => onGo(b.action.go)}>{b.action.label}</Button>
                    <button type="button" onClick={() => setDone((d) => [...d, b.id])} title="이번에는 넘기기"
                      aria-label={`${b.name} 넘기기`}
                      className={`shrink-0 h-8 px-2 rounded-lg text-[12px] font-semibold text-gray-400 hover:text-gray-700 hover:bg-black/[0.04] ${focusRing}`}>
                      넘김
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {queue.length > 12 && (
              <button type="button" onClick={() => setShowAll((v) => !v)}
                className={`w-full px-5 py-2.5 text-left text-[12px] font-semibold text-navy hover:bg-navy/[0.04] ${focusRing}`}>
                {showAll ? "12건만 보기" : `${queue.length - 12}건 더 보기`}
              </button>
            )}
            <p className="px-5 py-2.5 text-[11px] text-gray-400 border-t border-black/[0.05]">&lsquo;넘김&rsquo;은 이 화면에서만 감춥니다 — 데이터는 그대로입니다.</p>
          </>
        )}
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
                <li key={b.stage} className={`grid ${showMoney ? "grid-cols-[6rem_minmax(0,1fr)_2.5rem_5.5rem]" : "grid-cols-[6rem_minmax(0,1fr)_2.5rem]"} items-center gap-3`}>
                  <Chip tone={STAGE_TONE[b.stage]}>{b.stage}</Chip>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-navy/70 rounded-full" style={{ width: `${(b.n / max) * 100}%` }} />
                  </div>
                  <span className="text-[13px] font-semibold text-gray-800 tabular-nums text-right">{b.n}</span>
                  {/* 금액은 제안 플랜에 숫자가 적힌 것만 센다 — 플랜 이름만 보고 지어내지 않는다 */}
                  {showMoney && (
                    <span className="text-[12px] tabular-nums text-right text-gray-500" title={b.unknown ? `${b.unknown}곳은 제안 플랜에 금액이 없습니다` : undefined}>
                      {b.won ? `월 ${b.won.toLocaleString()}원` : b.n ? <span className="text-gray-300">금액 미정</span> : ""}
                      {b.won && b.unknown ? <span className="text-gray-300"> +{b.unknown}</span> : null}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
          {!loading && active.length > 0 && !showMoney && (
            <p className="text-[12px] text-gray-400 mt-3 pt-3 border-t border-black/[0.05]">
              제안 플랜에 금액을 적으면(예: <span className="text-gray-600">Boost 3만</span>) 단계마다 월 합계가 여기 붙습니다.
              지금은 금액이 적힌 후보가 없어 세지 않았습니다.
            </p>
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
                      <span className="flex-1 font-semibold text-gray-900 inline-flex items-center gap-1.5"><CampusMark campus={c} size={16} />{c}</span>
                      <span className="text-gray-500">파트너 <span className="font-semibold text-gray-900 tabular-nums">{st.length}</span> (유료 {st.filter((s) => isPaidTier(s.tier)).length})</span>
                      <span className="text-gray-500">후보 <span className="font-semibold text-gray-900 tabular-nums">{ld.length}</span></span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card title="기한이 있는 것" description="시트 '기한' 열 기준. 달력으로 보려면 왼쪽 '일정' 탭." actions={<Button size="sm" variant="ghost" onClick={() => onGo("astro-calendar")}>일정</Button>}>
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
