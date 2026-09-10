"use client";

import { useEffect, useState } from "react";
import { IconArrowUpRight, IconBrandSlack, IconMessageChatbot } from "@tabler/icons-react";
import { TOOLS, TOOL_ORDER, slackUrl, type ToolKey, type ToolMeta } from "@/lib/satellite";
import { focusRing, periodLocal } from "./ui";

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

export default function Launcher({ available, userName, onSelect }: { available: ToolKey[]; userName: string; onSelect: (key: ToolKey) => void }) {
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

      {/* 갤러리 — 큰 아이콘이 주인공. 카드는 아이콘을 받치는 흰 면일 뿐이다. */}
      <ul className="sat-stagger grid grid-cols-2 md:grid-cols-3 gap-3.5">
        {tools.map((t) => {
          const st = STATUS[t.status];
          const p = pulse[t.key as keyof Pulse];
          const hold = t.status === "hold";
          return (
            <li key={t.key} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(t.key)}
                aria-label={`${t.name} 열기`}
                className={`group relative w-full h-full flex flex-col items-stretch text-left bg-white/85 backdrop-blur rounded-[24px] p-5 md:p-6 border border-white/70 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_44px_-30px_rgba(5,0,114,0.4)] transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 hover:shadow-[0_28px_56px_-28px_rgba(5,0,114,0.5)] active:translate-y-0 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${focusRing} ${hold ? "opacity-75 hover:opacity-100" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <img src={`/satellite/${t.key}_app.svg`} alt="" width={64} height={64} className="w-14 h-14 md:w-16 md:h-16 rounded-[18px] shadow-[0_10px_24px_-14px_rgba(5,0,114,0.6)]" aria-hidden="true" />
                  <span className={`text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                </div>
                <div className="mt-5">
                  <p className="text-[19px] font-bold text-gray-900 tracking-[-0.01em] leading-tight">{t.name}</p>
                  <p className="text-[13px] text-gray-500 mt-0.5">{t.subtitle}</p>
                </div>
                <p className="hidden md:block text-[12px] text-gray-400 mt-2 leading-relaxed line-clamp-2">{t.description}</p>

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
      </ul>

      {/* Libra — 고르는 툴이 아니라 전체를 받치는 층. 그래서 카드가 아니라 스트립이다. */}
      <section aria-label="Libra" className="mt-6 rounded-[22px] border border-white/70 bg-[linear-gradient(135deg,rgba(5,0,114,0.05),rgba(99,102,224,0.08))] backdrop-blur px-5 py-4 flex flex-wrap items-center gap-4">
        <img src="/satellite/libra_app.svg" alt="" width={44} height={44} className="w-11 h-11 rounded-[14px] shadow-[0_8px_20px_-12px_rgba(5,0,114,0.6)]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-gray-900 tracking-[-0.01em]">{libra.name} <span className="text-[12px] font-medium text-gray-500 ml-1">모든 툴을 슬랙에서 보조합니다</span></p>
          <p className="text-[12px] text-gray-500 mt-0.5">
            <code className="bg-white/70 px-1.5 py-0.5 rounded text-[11px] text-navy">?현황</code> <code className="bg-white/70 px-1.5 py-0.5 rounded text-[11px] text-navy">?매장</code> <code className="bg-white/70 px-1.5 py-0.5 rounded text-[11px] text-navy">@Libra</code> · 아침 브리핑 · 추첨 D-1 알림 · 홍보 인사이트 태그
          </p>
        </div>
        <a href={slackUrl(libra)} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white text-[13px] font-semibold text-navy border border-navy/10 hover:border-navy/30 shadow-sm ${focusRing}`}>
          <IconBrandSlack size={15} aria-hidden="true" /> #{libra.slack.channel}
        </a>
        <span className="hidden md:inline-flex items-center gap-1 text-[12px] text-gray-400"><IconMessageChatbot size={14} aria-hidden="true" /> 웹 화면 없음</span>
      </section>

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
