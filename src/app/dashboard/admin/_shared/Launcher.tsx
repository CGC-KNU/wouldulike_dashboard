"use client";

import { useEffect, useState } from "react";
import { IconBrandSlack, IconChevronRight } from "@tabler/icons-react";
import { TOOLS, TOOL_ORDER, slackUrl, type ToolKey, type ToolMeta } from "@/lib/satellite";
import { Chip, focusRing, type ChipTone } from "./ui";

/**
 * 세틀라이트 런처.
 *
 * 예전엔 흰 카드 4장에 한 줄 설명만 있어 여백이 화면의 대부분이었다.
 * 지금은 카드 한 장이 그 툴의 **오늘 상태**를 말한다: 아이콘(툴_아이콘 원본) · 누가 쓰나 · 살아있는 숫자(막힌 것) ·
 * 슬랙 채널. 숫자는 각 툴 API 를 한 번씩 가볍게 찔러 온다. 못 읽으면 숫자 자리를 비운다.
 *
 * 슬랙은 채널 이름으로 연다. 워크스페이스에 로그인돼 있으면 바로 채널이 뜬다. 지금은 링크뿐이고
 * 알림·수집 연동은 뒤에 붙인다 (민열님 0910: "지금 연결되어야 한다는 뜻은 아님").
 */

interface Pulse {
  astro?: { stuck: number; leads: number; stale: number };
  probe?: { high: number; silent: number };
  castor?: { screens: number; experiments: number };
}

const STATUS: Record<ToolMeta["status"], { label: string; tone: ChipTone }> = {
  live: { label: "가동 중", tone: "green" },
  draft: { label: "초안", tone: "amber" },
  external: { label: "슬랙에서", tone: "gray" },
};

export default function Launcher({
  available,
  userName,
  onSelect,
}: {
  available: ToolKey[];
  userName: string;
  onSelect: (key: ToolKey) => void;
}) {
  const [pulse, setPulse] = useState<Pulse>({});

  useEffect(() => {
    // 런처는 가벼워야 한다. 세 요청을 병렬로 보내고, 어느 하나가 실패해도 나머지는 보여준다.
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
        if (quality?.counts) next.probe = { high: quality.counts.high ?? 0, silent: 0 };
        if (graph?.graph || exps?.experiments) next.castor = { screens: graph?.graph?.screens?.length ?? 0, experiments: (exps?.experiments ?? []).length };
        setPulse(next);
      }
    );
  }, []);

  const tools = TOOL_ORDER.map((k) => TOOLS[k]).filter((t) => t.status === "external" || available.includes(t.key));

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="text-[12px] font-semibold text-navy">Satellite</p>
          <h1 className="text-[22px] font-bold text-gray-900 leading-tight">우주라이크 업무 툴</h1>
          <p className="text-[13px] text-gray-500 mt-1">{userName}님, 오늘 볼 도구를 고르세요. 카드의 숫자는 지금 막힌 일입니다.</p>
        </div>
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {tools.map((t) => {
          const st = STATUS[t.status];
          const external = t.status === "external";
          const p = pulse[t.key as keyof Pulse];
          return (
            <li key={t.key}>
              <div
                className={`group relative h-full bg-white border border-gray-200 rounded-xl p-4 flex gap-4 transition-colors ${
                  external ? "" : "hover:border-navy/50"
                }`}
              >
                <img src={t.icon} alt="" width={48} height={48} className="w-12 h-12 shrink-0 rounded-xl" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {external ? (
                      <a
                        href={slackUrl(t)}
                        target="_blank"
                        rel="noreferrer"
                        className={`text-[16px] font-bold text-gray-900 hover:text-navy ${focusRing} rounded`}
                      >
                        {t.name}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelect(t.key)}
                        className={`text-[16px] font-bold text-gray-900 hover:text-navy text-left ${focusRing} rounded after:absolute after:inset-0`}
                      >
                        {t.name}
                      </button>
                    )}
                    <span className="text-[13px] text-gray-500">{t.subtitle}</span>
                    <Chip tone={st.tone}>{st.label}</Chip>
                  </div>
                  <p className="text-[13px] text-gray-600 mt-1 leading-relaxed">{t.description}</p>

                  {/* 살아있는 숫자. 없으면 자리를 비운다 — 0 을 지어내지 않는다. */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[12px]">
                    {t.key === "astro" && p && "stuck" in p && (
                      <>
                        <Stat label="입금 미확인" value={p.stuck} alert />
                        <Stat label="진행 중 후보" value={p.leads} />
                        <Stat label="7일 이상 멈춤" value={p.stale} alert />
                      </>
                    )}
                    {t.key === "probe" && p && "high" in p && <Stat label="정합성 높음" value={p.high} alert />}
                    {t.key === "castor" && p && "screens" in p && (
                      <>
                        <Stat label="화면" value={p.screens} />
                        <Stat label="실험" value={p.experiments} />
                      </>
                    )}
                    <span className="text-gray-400">쓰는 사람 · {t.users}</span>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <a
                      href={slackUrl(t)}
                      target="_blank"
                      rel="noreferrer"
                      className={`relative z-10 inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-navy ${focusRing} rounded`}
                    >
                      <IconBrandSlack size={14} aria-hidden="true" />#{t.slack.channel}
                    </a>
                    {!external && (
                      <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-navy opacity-0 group-hover:opacity-100 transition-opacity">
                        열기 <IconChevronRight size={14} aria-hidden="true" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[12px] text-gray-400 mt-5">
        Papillon 은 마케팅팀이, Aether 는 개발 총괄이 맡습니다. Astro · Probe · Castor 는 초안이라 화면의 '초안 데이터' 표시를 같이 보세요.
      </p>
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-gray-500">{label}</span>
      <span className={`font-bold tabular-nums ${alert && value > 0 ? "text-red-600" : "text-gray-900"}`}>{value}</span>
    </span>
  );
}
