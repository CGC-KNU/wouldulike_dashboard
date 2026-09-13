"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconArrowUpRight, IconBrandSlack, IconChevronLeft, IconChevronRight, IconMessageChatbot } from "@tabler/icons-react";
import { TOOLS, TOOL_ORDER, slackUrl, type ToolKey, type ToolMeta } from "@/lib/satellite";
import { focusRing, periodLocal, agoLabel } from "./ui";
import type { SatelliteStatus } from "./useSatelliteStatus";

/**
 * 세틀라이트 런처 — 갤러리.
 *
 * 0911(민열님): 툴 고르는 칸을 더 예쁘게, 갤러리 형태로. Libra 는 고르는 대상이 아니라 **전체를 보조하는 층**이라 하단 스트립.
 * Castor 는 VE(Visual Engineer) 영입 후 재검토 → '보류' 로 표시하되 열리긴 한다.
 *
 * 카드 한 장 = 앱 아이콘(툴_아이콘 앱판) · 이름 · 한 줄 · 살아있는 숫자. 숫자는 각 툴 API 를 가볍게 찔러 온다.
 * 못 읽으면 자리를 비운다 — 0 을 지어내지 않는다. 장식은 없고 위계는 크기와 무게, 아이콘의 색면 하나로만 낸다.
 */

interface Pulse {
  astro?: { stuck: number; leads: number; stale: number };
  probe?: { high: number; due: number; held: number };
  castor?: { screens: number; experiments: number };
}

const STATUS: Record<ToolMeta["status"], { label: string; cls: string }> = {
  live: { label: "가동 중", cls: "text-emerald-600" },
  draft: { label: "초안", cls: "text-amber-600" },
  hold: { label: "보류 · VE 영입 후", cls: "text-gray-400" },
  external: { label: "슬랙", cls: "text-gray-400" },
};

export default function Launcher({ available, userName, onSelect, status, onGo }: { available: ToolKey[]; userName: string; onSelect: (key: ToolKey) => void; status?: SatelliteStatus | null; onGo?: (target: string) => void }) {
  const [pulse, setPulse] = useState<Pulse>({});

  useEffect(() => {
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const period = periodLocal();
    Promise.all([j("/api/astro/stores"), j("/api/astro/leads"), j(`/api/astro/invoices?period=${period}`), j("/api/probe/quality"), j("/api/probe/insights"), j("/api/probe/mileage"), j("/api/castor/graph"), j("/api/castor/experiments")]).then(
      ([stores, leads, inv, quality, ins, mil, graph, exps]) => {
        const next: Pulse = {};
        if (stores?.stores) {
          type S = { restaurant_id: number; tier: string | null; is_affiliate: boolean; ops: { billing?: string; pay_cycle?: string | null; is_test?: boolean } | null };
          const paid = (stores.stores as S[]).filter((s) => s.is_affiliate && (s.tier === "BOOST" || s.tier === "CONTENT") && !s.ops?.is_test && s.ops?.billing !== "EXEMPT");
          const paidIds = new Set(((inv?.invoices ?? []) as { restaurant_id: number; paid_at: string | null; status: string }[]).filter((i) => i.paid_at && !["CANCELED", "REJECTED"].includes(i.status)).map((i) => i.restaurant_id));
          // 월납은 이번 달 계산서 입금, 일시납은 매장 상태값 — 매장 현황 화면과 같은 기준
          const stuck = paid.filter((s) => (s.ops?.pay_cycle === "LUMP" ? s.ops?.billing !== "PAID" : !paidIds.has(s.restaurant_id))).length;
          const ls = (leads?.leads ?? []) as { stage: string; last_touch_at: string | null }[];
          const activeLeads = ls.filter((l) => !["재컨택", "보류", "거절"].includes(l.stage));
          const stale = activeLeads.filter((l) => l.stage !== "계약 완료" && l.last_touch_at && Date.now() - Date.parse(l.last_touch_at) > 7 * 86_400_000).length;
          next.astro = { stuck, leads: activeLeads.length, stale };
        }
        if (quality?.counts || ins?.insights || mil?.rounds) {
          next.probe = {
            high: quality?.counts?.high ?? 0,
            due: ((ins?.insights ?? []) as { checkpoint: string }[]).filter((i) => ["D2", "D7", "D14"].includes(i.checkpoint)).length,
            held: ((mil?.rounds ?? []) as { result: string }[]).filter((r) => r.result === "held").length,
          };
        }
        if (graph?.graph || exps?.experiments) next.castor = { screens: graph?.graph?.screens?.length ?? 0, experiments: (exps?.experiments ?? []).length };
        setPulse(next);
      }
    );
  }, []);

  const tools = TOOL_ORDER.map((k) => TOOLS[k]).filter((t) => t.status !== "external" && available.includes(t.key));
  const libra = TOOLS.libra;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "좋은 아침이에요" : hour < 18 ? "좋은 오후예요" : "수고 많았어요";

  return (
    <div className="max-w-5xl mx-auto px-5 pt-10 pb-16">
      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[13px] font-semibold text-navy tracking-wide">Satellite</p>
          <h1 className="text-[34px] md:text-[40px] font-bold text-gray-900 tracking-[-0.02em] leading-[1.1] mt-1 text-balance">
            {greet}, <span className="bg-[linear-gradient(90deg,#050072,#6366E0)] bg-clip-text text-transparent">{userName}</span>님.
          </h1>
          <p className="text-[15px] text-gray-500 mt-2">오늘 볼 도구를 고르세요. 숫자는 지금 막힌 일입니다.</p>
        </div>
      </header>

      {/* 갤러리 — 옆으로 넘긴다. 데스크톱은 3장이 다 보이고 양옆이 비치며, 폰은 한 장씩. 툴이 스와이프 뒤에 숨지 않는 게 조건이다. */}
      <Gallery count={tools.length}>
        {tools.map((t) => {
          const st = STATUS[t.status];
          const p = pulse[t.key as keyof Pulse];
          const hold = t.status === "hold";
          return (
            <li key={t.key} data-card className="snap-center shrink-0 w-[300px] sm:w-[340px] md:w-[360px] min-h-[300px] flex transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] data-[far=true]:scale-[0.94] data-[far=true]:opacity-70 motion-reduce:transition-none">
              <button
                type="button"
                onClick={() => onSelect(t.key)}
                aria-label={`${t.name} 열기`}
                className={`group relative w-full flex flex-col items-stretch text-left bg-white/85 backdrop-blur rounded-[24px] p-5 md:p-6 border border-white/70 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_44px_-30px_rgba(5,0,114,0.4)] transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 hover:shadow-[0_28px_56px_-28px_rgba(5,0,114,0.5)] active:translate-y-0 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${focusRing} ${hold ? "opacity-75 hover:opacity-100" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <img src={`/satellite/${t.key}_app.svg`} alt="" width={64} height={64} className="w-14 h-14 md:w-16 md:h-16 rounded-[18px] shadow-[0_10px_24px_-14px_rgba(5,0,114,0.6)]" aria-hidden="true" />
                  <span className={`text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                </div>
                <div className="mt-5">
                  <p className="text-[19px] font-bold text-gray-900 tracking-[-0.01em] leading-tight">{t.name}</p>
                  <p className="text-[13px] text-gray-500 mt-0.5">{t.subtitle}</p>
                </div>
                <p className="text-[12px] text-gray-400 mt-2 leading-relaxed line-clamp-2">{t.description}</p>

                {/* 살아있는 숫자. 없으면 줄 자체가 없다. */}
                {t.key === "astro" && p && "stuck" in p && (
                  <div className="mt-4 flex gap-4"><Stat label="이달 입금 미확인" value={p.stuck} alert /><Stat label="진행 후보" value={p.leads} /><Stat label="멈춤" value={p.stale} alert /></div>
                )}
                {t.key === "probe" && p && "high" in p && (
                  <div className="mt-4 flex gap-4"><Stat label="보고할 차례" value={p.due} alert /><Stat label="추첨 보류" value={p.held} alert /><Stat label="정합성 높음" value={p.high} alert /></div>
                )}
                {t.key === "castor" && p && "screens" in p && (
                  <div className="mt-4 flex gap-4"><Stat label="화면" value={p.screens} /><Stat label="실험" value={p.experiments} /></div>
                )}

                <span className="mt-auto pt-4 self-end inline-flex items-center gap-0.5 text-[12px] font-semibold text-navy opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                  열기 <IconArrowUpRight size={14} aria-hidden="true" />
                </span>
              </button>
            </li>
          );
        })}
      </Gallery>

      {/* Libra — 고르는 툴이 아니라 전체를 받치는 층. 그래서 카드가 아니라 스트립이다. */}
      <section aria-label="Libra" className="mt-6 rounded-[22px] border border-white/70 bg-[linear-gradient(135deg,rgba(5,0,114,0.05),rgba(99,102,224,0.08))] backdrop-blur px-5 py-4 flex flex-wrap items-center gap-4">
        <img src="/satellite/libra_app.svg" alt="" width={44} height={44} className="w-11 h-11 rounded-[14px] shadow-[0_8px_20px_-12px_rgba(5,0,114,0.6)]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-gray-900 tracking-[-0.01em]">{libra.name} <span className="text-[12px] font-medium text-gray-500 ml-1">모든 툴을 슬랙에서 보조합니다</span></p>
          <p className="text-[12px] text-gray-500 mt-0.5">
            <code className="bg-white/70 px-1.5 py-0.5 rounded text-[11px] text-navy">?현황</code> <code className="bg-white/70 px-1.5 py-0.5 rounded text-[11px] text-navy">?매장</code> <code className="bg-white/70 px-1.5 py-0.5 rounded text-[11px] text-navy">@Libra</code> · 아침 브리핑 · 추첨 D-1 알림 · 리포트 시점 태그
          </p>
        </div>
        <a href={slackUrl(libra)} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white text-[13px] font-semibold text-navy border border-navy/10 hover:border-navy/30 shadow-sm ${focusRing}`}>
          <IconBrandSlack size={15} aria-hidden="true" /> #{libra.slack.channel}
        </a>
        <span className="hidden md:inline-flex items-center gap-1 text-[12px] text-gray-400"><IconMessageChatbot size={14} aria-hidden="true" /> 웹 화면 없음</span>
      </section>

      {/* 전체 현황 — 애딧 대행사 대시보드의 "총량 + 활성 부수치" 카드와 "최근 목록 3개 · 전체 보기 →" 를 차용. 숫자는 각 툴 화면과 같은 API. */}
      {status && (
        <section aria-label="전체 현황" className="mt-8">
          <p className="text-[13px] font-semibold text-navy tracking-wide mb-3">전체 현황</p>
          <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat2 label="파트너 매장" value={status.stores?.total} sub={status.stores ? `유료 ${status.stores.paid}` : undefined} onClick={() => onGo?.("astro-ops")} />
            <Stat2 label="파트너 후보" value={status.leads?.active} sub={status.leads ? `미팅 잡힘 ${status.leads.meetings}` : undefined} onClick={() => onGo?.("astro-leads")} />
            <Stat2 label={`${Number((status.billing?.period ?? periodLocal()).slice(5))}월 청구`} value={status.billing?.billed} sub={status.billing ? `입금 ${status.billing.paid} · 미확인 ${status.billing.unpaid}` : undefined} alert={Boolean(status.billing?.unpaid)} onClick={() => onGo?.("astro-billing")} />
            <Stat2 label="매장 리포트" value={status.reports ? status.reports.sent : undefined} sub={status.reports ? `열람 ${status.reports.viewed} · 검토 대기 ${status.reports.draft + status.reports.linked}` : undefined} alert={Boolean(status.reports && status.reports.draft + status.reports.linked)} onClick={() => onGo?.("probe-reports")} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
            <Recent title="최근 파트너" more={() => onGo?.("astro-ops")} empty="아직 없습니다" rows={(status.stores?.recent ?? []).map((r) => ({ key: String(r.id), a: r.name, b: [r.campus, r.tier].filter(Boolean).join(" · "), c: r.signed ? `계약 ${r.signed.slice(5).replace("-", "/")}` : agoLabel(r.updated), onClick: () => onGo?.(`astro-ops?open=${r.id}`) }))} />
            <Recent title="최근 후보 움직임" more={() => onGo?.("astro-leads")} empty="아직 없습니다" rows={(status.leads?.recent ?? []).map((r) => ({ key: r.id, a: r.name, b: r.owner ?? "", c: r.stage, onClick: () => onGo?.(`astro-leads?open=${r.id}`) }))} />
            <Recent title="이번 달 정산" more={() => onGo?.("astro-billing")} empty="이번 달 청구가 없습니다" rows={(status.billing?.rows ?? []).map((r) => ({ key: r.id, a: r.name, b: `${r.total.toLocaleString()}원`, c: r.paid_at ? "입금 확인" : r.status === "ISSUED" ? "발행 · 대기" : "품의", tone: r.paid_at ? "green" : r.status === "PENDING" ? "amber" : "blue", onClick: () => onGo?.("astro-billing") }))} />
          </div>
        </section>
      )}

      <p className="text-[12px] text-gray-400 mt-6">Astro · Probe 는 초안입니다. 화면의 '초안 데이터' 표시를 같이 보세요. Castor 는 Visual Engineer 합류 후 다시 봅니다.</p>
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <span className="flex flex-col min-w-0">
      <span className={`text-[20px] font-bold tracking-[-0.01em] tabular-nums leading-none ${alert && value > 0 ? "text-red-600" : "text-gray-900"}`}>{value}</span>
      <span className="text-[11px] text-gray-400 mt-1 truncate">{label}</span>
    </span>
  );
}

/**
 * 스냅 스크롤 갤러리. 가운데에 온 카드가 제 크기, 멀어진 카드는 살짝 작고 흐리다(IntersectionObserver 로 판정).
 * 스크롤바는 숨기고 화살표·점·키보드 ←→ 로도 넘긴다. 코버플로우처럼 한 장만 보여주지 않는다 — 하루 열 번 여는 화면이다.
 */
function Gallery({ count, children }: { count: number; children: React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-card]"));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const i = cards.indexOf(e.target as HTMLElement);
        (e.target as HTMLElement).dataset.far = e.intersectionRatio < 0.85 ? "true" : "false";
        if (e.intersectionRatio >= 0.85 && i !== -1) setActive((cur) => (Math.abs(i - cur) === 0 ? cur : i));
      }
    }, { root: el, threshold: [0.5, 0.85, 1] });
    cards.forEach((c) => io.observe(c));
    // 데스크톱은 3장이 보이므로 가운데(두 번째 = Astro)에서 시작한다. 폰은 첫 장.
    if (window.innerWidth >= 768 && cards[1]) { el.scrollLeft = cards[1].offsetLeft - (el.clientWidth - cards[1].clientWidth) / 2; }
    return () => io.disconnect();
  }, [count]);

  const go = useCallback((i: number) => {
    const el = ref.current; if (!el) return;
    const cards = el.querySelectorAll<HTMLElement>("[data-card]");
    const target = cards[Math.max(0, Math.min(count - 1, i))];
    target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [count]);

  return (
    <div className="relative -mx-5">
      <ul
        ref={ref}
        tabIndex={0}
        aria-label="툴 갤러리 — 좌우로 넘기세요"
        onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(active + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(active - 1); } }}
        className={`sat-stagger flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth px-[max(20px,calc(50%-180px))] py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${focusRing} rounded-xl`}
      >
        {children}
      </ul>
      {/* 화살표 — 데스크톱에서만. 폰은 손가락이 더 빠르다. */}
      <button type="button" aria-label="이전" onClick={() => go(active - 1)} disabled={active === 0} className={`hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 border border-black/[0.06] shadow-sm items-center justify-center text-gray-600 hover:text-navy disabled:opacity-30 active:scale-95 transition ${focusRing}`}><IconChevronLeft size={18} aria-hidden="true" /></button>
      <button type="button" aria-label="다음" onClick={() => go(active + 1)} disabled={active >= count - 1} className={`hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 border border-black/[0.06] shadow-sm items-center justify-center text-gray-600 hover:text-navy disabled:opacity-30 active:scale-95 transition ${focusRing}`}><IconChevronRight size={18} aria-hidden="true" /></button>
      <div className="flex justify-center gap-1.5 mt-1" role="tablist" aria-label="갤러리 위치">
        {Array.from({ length: count }).map((_, i) => (
          <button key={i} type="button" role="tab" aria-selected={i === active} aria-label={`${i + 1}번째`} onClick={() => go(i)} className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ${i === active ? "w-5 bg-navy" : "w-1.5 bg-black/15 hover:bg-black/30"}`} />
        ))}
      </div>
    </div>
  );
}

function Stat2({ label, value, sub, alert, onClick }: { label: string; value?: number; sub?: string; alert?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`text-left bg-white/85 backdrop-blur rounded-[18px] px-4 py-3.5 border border-white/70 shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:-translate-y-0.5 transition-transform ${focusRing}`}>
      <p className="text-[12px] text-gray-500">{label}</p>
      <p className="flex items-baseline gap-2 mt-0.5"><span className={`text-[24px] font-bold tabular-nums tracking-[-0.01em] ${value === undefined ? "text-gray-300" : "text-gray-900"}`}>{value ?? "—"}</span>{sub && <span className={`text-[12px] ${alert ? "text-red-600 font-semibold" : "text-gray-500"}`}>{sub}</span>}</p>
    </button>
  );
}

function Recent({ title, more, empty, rows }: { title: string; more: () => void; empty: string; rows: { key: string; a: string; b: string; c: string; tone?: "green" | "amber" | "blue"; onClick?: () => void }[] }) {
  const tone = { green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-800", blue: "bg-blue-50 text-blue-700" };
  return (
    <div className="bg-white/85 backdrop-blur rounded-[18px] border border-white/70 shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.05]"><span className="text-[13px] font-semibold text-gray-900">{title}</span><button type="button" onClick={more} className={`text-[12px] font-medium text-navy hover:underline rounded ${focusRing}`}>전체 보기 →</button></div>
      {rows.length === 0 ? <p className="px-4 py-5 text-[12px] text-gray-400">{empty}</p> : (
        <ul className="divide-y divide-black/[0.05]">
          {rows.map((r) => (
            <li key={r.key}><button type="button" onClick={r.onClick} className={`w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-navy/[0.03] ${focusRing}`}><span className="flex-1 min-w-0"><span className="block text-[13px] font-medium text-gray-900 truncate">{r.a}</span>{r.b && <span className="block text-[11px] text-gray-400 truncate">{r.b}</span>}</span><span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${r.tone ? tone[r.tone] : "text-gray-500"}`}>{r.c}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
