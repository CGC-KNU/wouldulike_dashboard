"use client";

import { useEffect, useState } from "react";
import { IconArrowUpRight, IconBrandSlack } from "@tabler/icons-react";
import { TOOLS, TOOL_ORDER, slackUrl, type ToolKey, type ToolMeta } from "@/lib/satellite";
import { focusRing } from "./ui";

/**
 * 세틀라이트 런처.
 *
 * 카드 한 장이 그 툴의 오늘 상태를 말한다: 아이콘(툴_아이콘 원본) · 한 줄 설명 · 살아있는 숫자 · 슬랙 채널.
 * 숫자는 각 툴 API 를 한 번씩 가볍게 찔러 온다. 못 읽으면 자리를 비운다. 0 을 지어내지 않는다.
 *
 * 애플 쪽 문법을 빌렸다 — 큰 여백 대신 **큰 타이포와 부드러운 면**, 그림자 없는 흰 타일에 아주 옅은 틴트,
 * 눌리는 느낌은 hover 에 살짝 뜨는 것으로. 장식은 없고 위계는 크기와 무게로만 낸다.
 * 슬랙은 채널 링크까지(민열님 0910: "지금 연결되어야 한다는 뜻은 아님").
 */

interface Pulse {
  astro?: { stuck: number; leads: number; stale: number };
  probe?: { high: number };
  castor?: { screens: number; experiments: number };
}

const STATUS: Record<ToolMeta["status"], { label: string; cls: string }> = {
  live: { label: "가동 중", cls: "text-emerald-600" },
  draft: { label: "초안", cls: "text-amber-600" },
  external: { label: "슬랙", cls: "text-gray-400" },
};

/** 툴별 아이콘 타일 틴트. 색은 한 계열(navy)의 농도만 다르다. */
const TINT: Record<ToolKey, string> = {
  papillon: "bg-[#eef0ff]",
  astro: "bg-[#e9ecff]",
  probe: "bg-[#eef0ff]",
  castor: "bg-[#e9ecff]",
  aether: "bg-gray-100",
  libra: "bg-gray-100",
};

export default function Launcher({ available, userName, onSelect }: { available: ToolKey[]; userName: string; onSelect: (key: ToolKey) => void }) {
  const [pulse, setPulse] = useState<Pulse>({});

  useEffect(() => {
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([j("/api/astro/stores"), j("/api/astro/leads"), j("/api/probe/quality"), j("/api/castor/graph"), j("/api/castor/experiments")]).then(
      ([stores, leads, quality, graph, exps]) => {
        const next: Pulse = {};
        if (stores?.stores) {
          const paid = (stores.stores as { tier: string | null; is_affiliate: boolean; ops: { billing?: string; is_test?: boolean } | null }[]).filter(
            (s) => s.is_affiliate && (s.tier === "BOOST" || s.tier === "CONTENT") && !s.ops?.is_test
          );
          const stuck = paid.filter((s) => s.ops?.billing !== "PAID" && s.ops?.billing !== "EXEMPT").length;
          const ls = (leads?.leads ?? []) as { stage: string; last_touch_at: string | null }[];
          const activeLeads = ls.filter((l) => !["재컨택", "보류", "거절"].includes(l.stage));
          const stale = activeLeads.filter((l) => l.stage !== "계약 완료" && l.last_touch_at && Date.now() - Date.parse(l.last_touch_at) > 7 * 86_400_000).length;
          next.astro = { stuck, leads: activeLeads.length, stale };
        }
        if (quality?.counts) next.probe = { high: quality.counts.high ?? 0 };
        if (graph?.graph || exps?.experiments) next.castor = { screens: graph?.graph?.screens?.length ?? 0, experiments: (exps?.experiments ?? []).length };
        setPulse(next);
      }
    );
  }, []);

  const tools = TOOL_ORDER.map((k) => TOOLS[k]).filter((t) => t.status === "external" || available.includes(t.key));
  const hour = new Date().getHours();
  const greet = hour < 12 ? "좋은 아침이에요" : hour < 18 ? "좋은 오후예요" : "수고 많았어요";

  return (
    <div className="max-w-5xl mx-auto px-5 pt-10 pb-20">
      <header className="mb-8">
        <p className="text-[13px] font-semibold text-navy tracking-wide">Satellite</p>
        <h1 className="text-[34px] md:text-[40px] font-bold text-gray-900 tracking-[-0.02em] leading-[1.1] mt-1 text-balance">
          {greet}, <span className="bg-[linear-gradient(90deg,#050072,#6366E0)] bg-clip-text text-transparent">{userName}</span>님.
        </h1>
        <p className="text-[15px] text-gray-500 mt-2">오늘 볼 도구를 고르세요. 숫자는 지금 막힌 일입니다.</p>
      </header>

      <ul className="sat-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((t) => {
          const st = STATUS[t.status];
          const external = t.status === "external";
          const p = pulse[t.key as keyof Pulse];
          const open = external ? () => window.open(slackUrl(t), "_blank", "noreferrer") : () => onSelect(t.key);
          return (
            <li key={t.key} className="min-w-0">
              <button
                type="button"
                onClick={open}
                className={`group w-full h-full text-left bg-white/90 backdrop-blur rounded-[22px] p-5 border border-white/70 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_40px_-28px_rgba(5,0,114,0.35)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_24px_48px_-24px_rgba(5,0,114,0.45)] active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${focusRing}`}
              >
                <div className="flex items-start justify-between">
                  <span className={`w-14 h-14 rounded-2xl ${TINT[t.key]} flex items-center justify-center`}>
                    <img src={t.icon} alt="" width={36} height={36} className="w-9 h-9" aria-hidden="true" />
                  </span>
                  <span className={`text-[12px] font-semibold ${st.cls}`}>{st.label}</span>
                </div>

                <div className="mt-5">
                  <p className="flex items-baseline gap-2">
                    <span className="text-[20px] font-bold text-gray-900 tracking-[-0.01em]">{t.name}</span>
                    <span className="text-[13px] text-gray-400">{t.subtitle}</span>
                  </p>
                  <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">{t.description}</p>
                </div>

                {/* 살아있는 숫자. 없으면 줄 자체가 없다. */}
                {t.key === "astro" && p && "stuck" in p && (
                  <div className="mt-4 flex gap-4">
                    <Stat label="입금 미확인" value={p.stuck} alert />
                    <Stat label="진행 중 후보" value={p.leads} />
                    <Stat label="멈춘 후보" value={p.stale} alert />
                  </div>
                )}
                {t.key === "probe" && p && "high" in p && (
                  <div className="mt-4 flex gap-4"><Stat label="정합성 높음" value={p.high} alert /></div>
                )}
                {t.key === "castor" && p && "screens" in p && (
                  <div className="mt-4 flex gap-4"><Stat label="화면" value={p.screens} /><Stat label="실험" value={p.experiments} /></div>
                )}

                <div className="mt-5 pt-4 border-t border-black/[0.06] flex items-center justify-between">
                  <a
                    href={slackUrl(t)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={`inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-400 hover:text-navy rounded ${focusRing}`}
                  >
                    <IconBrandSlack size={14} aria-hidden="true" />#{t.slack.channel}
                  </a>
                  <span className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-navy opacity-60 group-hover:opacity-100 transition-opacity">
                    {external ? "슬랙에서 열기" : "열기"} <IconArrowUpRight size={15} aria-hidden="true" />
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-[12px] text-gray-400 mt-8">
        Astro · Probe · Castor 는 초안입니다. 화면의 '초안 데이터' 표시를 같이 보세요.
      </p>
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className={`text-[22px] font-bold tracking-[-0.01em] tabular-nums leading-none ${alert && value > 0 ? "text-red-600" : "text-gray-900"}`}>{value}</span>
      <span className="text-[11px] text-gray-400 mt-1">{label}</span>
    </span>
  );
}
