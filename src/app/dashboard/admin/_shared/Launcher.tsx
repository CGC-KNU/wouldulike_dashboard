"use client";

import { useEffect, useState } from "react";
import { IconFolder } from "@tabler/icons-react";
import { TOOLS, TOOL_ORDER, slackUrl, type ToolKey, type ToolMeta } from "@/lib/satellite";
import { focusRing, periodLocal } from "./ui";
import type { SatelliteStatus } from "./useSatelliteStatus";
import WeekIssues from "./WeekIssues";
import { greetingFor, addressee } from "./greeting";
import Polaris from "./Polaris";
import Satty from "./Satty";
import LibraHelp from "./LibraHelp";
import OrbitCard from "../orbit/OrbitCard";

/**
 * 세틀라이트 런처.
 *
 * 1011 민열님: 맨 위 Orbit(큰 일) + 이번 주(높이 고정) → 도구 한 줄(설명 없이) → 「그 밖」 줄(Atlas · Drive · 세티 · Libra).
 * Libra 를 누르면 슬랙으로 넘기지 않고 사용법 팝업(LibraHelp).
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
}

const STATUS: Record<ToolMeta["status"], { label: string; cls: string }> = {
  live: { label: "가동 중", cls: "text-emerald-600" },
  draft: { label: "초안", cls: "text-amber-600" },
  hold: { label: "보류 · VE 영입 후", cls: "text-gray-400" },
  external: { label: "슬랙", cls: "text-gray-400" },
};

/** 세틀라이트 툴이 아니면서 런처에서 열어야 하는 제품(예: Drive — 파일 저장소). 카드 대신 하단 스트립. */
export interface LauncherExtra { key: string; name: string; subtitle?: string; description?: string }

const extraCls = "w-full h-full text-left rounded-[14px] border border-white/70 bg-white/70 backdrop-blur px-3 py-2 flex items-center gap-2.5 hover:border-navy/20 transition-colors";

export default function Launcher({ available, extras = [], userName, username = "", userTitle, onSelect, onPlayroom, onOrbit, status, onGo }: { available: ToolKey[]; extras?: LauncherExtra[]; userName: string; username?: string; userTitle?: string | null; onPlayroom?: () => void; onSelect: (key: string) => void; onOrbit?: (id?: string) => void; status?: SatelliteStatus | null; onGo?: (target: string) => void }) {
  const [pulse, setPulse] = useState<Pulse>({});

  useEffect(() => {
    // 늦는 한 곳 때문에 카드 숫자가 통째로 안 뜨는 걸 막는다 (useSatelliteStatus 와 같은 이유)
    const j = (u: string) =>
      fetch(u, { signal: AbortSignal.timeout(8000) })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    const period = periodLocal();
    // Castor 는 보류 상태라 부르지 않는다. 안 쓰는 툴의 숫자를 매 로그인마다 받아 올 이유가 없다 (0914).
    Promise.all([j("/api/astro/stores"), j("/api/astro/leads"), j(`/api/astro/invoices?period=${period}`), j("/api/probe/quality"), j("/api/probe/insights"), j("/api/probe/mileage")]).then(
      ([stores, leads, inv, quality, ins, mil]) => {
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
        setPulse(next);
      }
    );
  }, []);

  // Atlas 는 도구가 아니라 회사 소개라 「그 밖」 줄로, Orbit 은 맨 위 카드로 간다 (1011)
  const tools = TOOL_ORDER.map((k) => TOOLS[k]).filter((t) => t.status !== "external" && t.key !== "atlas" && t.key !== "orbit" && available.includes(t.key));
  const [libraOpen, setLibraOpen] = useState(false);
  const libra = TOOLS.libra;
  /**
   * 인사말은 **처음 그릴 때 한 번만** 정한다 (민열님 0919). 다시 그릴 때마다 계산하면
   * 자정이나 정각을 넘기는 순간 글자가 슬쩍 바뀌어 눈에 걸린다.
   */
  // 서버(Vercel, UTC)에서 만들면 밤에 "좋은 아침"이 나온다 — 브라우저 시계로 붙은 뒤 한 번 정한다 (0919).
  const [greet, setGreet] = useState<string | null>(null);
  useEffect(() => { setGreet(greetingFor()); }, []);
  /** 이번 주 일정 건수 — WeekIssues 가 세어서 알려 준다. Satty 의 '피곤' 판정에 쓴다. */
  const [weekCount, setWeekCount] = useState(0);
  const who = addressee(username, userName);

  return (
    <div className="max-w-6xl mx-auto px-5 pt-10 pb-16">
      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[13px] font-semibold text-navy tracking-wide inline-flex items-center gap-1.5">
            {/* 세틀라이트 마크 — 상단 바·탭 아이콘과 같은 도형 */}
            <img src="/satellite/satellite_app.svg" alt="" width={18} height={18} className="w-[18px] h-[18px] rounded-[5px]" aria-hidden="true" />
            Satellite
          </p>
          <h1 className="text-[34px] md:text-[40px] font-bold text-gray-900 tracking-[-0.02em] leading-[1.1] mt-1 text-balance">
            {greet ?? "안녕하세요"}, <span className="bg-[linear-gradient(90deg,#050072,#6366E0)] bg-clip-text text-transparent">{who.name}</span>{who.suffix}.
            {/* 직함은 이름 뒤 한 칸. 크기를 낮춰 이름이 먼저 읽히게 둔다 (민열님 0919). */}
            {userTitle && <span className="ml-2 align-middle text-[14px] md:text-[15px] font-bold text-gray-500 tracking-[-0.01em]">{userTitle}</span>}
          </h1>
          <p className="text-[15px] text-gray-500 mt-2">오늘 볼 도구를 고르세요. 카드의 숫자는 <span className="text-gray-700 font-medium">지금 막힌 일</span>입니다.</p>
        </div>
      </header>

      {/* 1011 민열님: 맨 위 = Orbit(큰 일) + 이번 주. 이번 주를 왼쪽 열에 두면 일정이 많을 때 끝없이 늘어나
          아래가 밀렸다 — 이제 두 칸 높이를 묶고 넘치면 카드 안에서 스크롤한다. 폰에서는 Orbit → 이번 주 순서로 선다. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 lg:h-[17rem]">
        <div className="min-h-0 h-[22rem] lg:h-auto"><OrbitCard onOpen={(id) => onOrbit?.(id)} /></div>
        <div className="min-h-0 max-h-[22rem] lg:max-h-none"><WeekIssues onGo={onGo} onCount={setWeekCount} fill /></div>
      </div>

      {/* 도구 — 앱 아이콘 · 이름 · 상태만(1011: 회색 설명 뺌). 한 줄에 여섯. */}
      <p className="mt-6 mb-2 text-[12px] font-bold text-gray-500 tracking-[0.02em]">도구</p>
      <ul aria-label="도구" className="sat-stagger grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {tools.map((t) => {
          const st = STATUS[t.status];
          const p = pulse[t.key as keyof Pulse];
          const hold = t.status === "hold";
          const blocked = t.key === "astro" && p && "stuck" in p ? p.stuck + p.stale
            : t.key === "probe" && p && "high" in p ? p.due + p.held : 0;
          return (
            <li key={t.key} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(t.key)}
                aria-label={`${t.name} 열기`}
                title={t.description}
                className={`group w-full text-left bg-white/85 backdrop-blur rounded-[16px] px-3 py-2.5 border border-white/70 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_14px_30px_-26px_rgba(5,0,114,0.5)] transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-24px_rgba(5,0,114,0.45)] active:translate-y-0 motion-reduce:transition-none flex items-center gap-2.5 min-w-0 ${focusRing} ${hold ? "opacity-70 hover:opacity-100" : ""}`}
              >
                <img src={`/satellite/${t.key}_app.svg`} alt="" width={36} height={36} className="w-9 h-9 rounded-[11px] shrink-0 shadow-[0_6px_16px_-10px_rgba(5,0,114,0.6)]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-gray-900 tracking-[-0.015em] leading-tight truncate">{t.name}</span>
                  <span className="block text-[11px] font-medium text-gray-500 truncate">{t.subtitle}</span>
                </span>
                {/* 막힌 게 있으면 숫자, 없으면 상태 점 하나. */}
                {blocked > 0
                  ? <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-600 text-white text-[11.5px] font-bold tabular-nums grid place-content-center">{blocked}</span>
                  : <span className={`shrink-0 w-2 h-2 rounded-full ${t.status === "live" ? "bg-emerald-500" : t.status === "draft" ? "bg-amber-500" : "bg-gray-300"}`} title={st.label} aria-label={st.label} />}
              </button>
            </li>
          );
        })}
      </ul>

      {/* 그 밖 — 도구가 아닌 것(조직 · 파일 · 쉬는 곳 · 슬랙 비서)은 줄을 바꿔 작게 (1011 민열님). */}
      <p className="mt-5 mb-2 text-[12px] font-bold text-gray-500 tracking-[0.02em]">그 밖</p>
      <ul aria-label="그 밖" className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {available.includes("atlas") && (
          <li className="min-w-0"><button type="button" onClick={() => onSelect("atlas")} className={`${extraCls} ${focusRing}`}>
            <img src="/satellite/atlas_app.svg" alt="" width={30} height={30} className="w-[30px] h-[30px] rounded-[9px] shrink-0" aria-hidden="true" />
            <span className="min-w-0"><span className="block text-[13px] font-bold text-gray-900">Atlas</span><span className="block text-[11px] text-gray-500 truncate">조직도 · 미션 · 연혁</span></span>
          </button></li>
        )}
        {extras.map((e) => (
          <li key={e.key} className="min-w-0"><button type="button" onClick={() => onSelect(e.key)} className={`${extraCls} ${focusRing}`}>
            <span className="w-[30px] h-[30px] rounded-[9px] shrink-0 bg-navy text-white grid place-items-center" aria-hidden="true"><IconFolder size={16} /></span>
            <span className="min-w-0"><span className="block text-[13px] font-bold text-gray-900">{e.name}</span><span className="block text-[11px] text-gray-500 truncate">{e.subtitle}</span></span>
          </button></li>
        ))}
        {onPlayroom && (
          <li className="min-w-0"><button type="button" onClick={onPlayroom} className={`${extraCls} ${focusRing}`}>
            <span aria-hidden="true" className="w-[30px] h-[30px] rounded-[9px] shrink-0 bg-[linear-gradient(135deg,#7C7EF0,#2B28B8)] flex items-center justify-center">
              <svg viewBox="0 0 160 160" className="w-5 h-5"><circle cx="80" cy="88" r="46" fill="#fff" opacity=".95" /><circle cx="66" cy="82" r="6" fill="#2B28B8" /><circle cx="94" cy="82" r="6" fill="#2B28B8" /><rect x="72" y="30" width="16" height="14" rx="6" fill="#fff" opacity=".95" /></svg>
            </span>
            <span className="min-w-0"><span className="block text-[13px] font-bold text-gray-900">세티랑 놀기</span><span className="block text-[11px] text-gray-500 truncate">밥 주고 놀아 주기</span></span>
          </button></li>
        )}
        <li className="min-w-0"><button type="button" onClick={() => setLibraOpen(true)} className={`${extraCls} !bg-[linear-gradient(135deg,rgba(43,190,155,0.10),rgba(127,233,203,0.18))] !border-libra/30 hover:!border-libra ${focusRing}`}>
          <span aria-hidden="true" className="w-[30px] h-[30px] rounded-[9px] shrink-0 bg-[linear-gradient(135deg,#7FE9CB,#2BBE9B)] flex items-center justify-center">
            <span className="block w-5 h-5 bg-white" style={{ WebkitMaskImage: "url(/satellite/libra.svg)", maskImage: "url(/satellite/libra.svg)", WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }} />
          </span>
          <span className="min-w-0"><span className="block text-[13px] font-bold text-libra-deep">{libra.name}</span><span className="block text-[11px] text-gray-500 truncate">슬랙 사용법</span></span>
        </button></li>
      </ul>
      <LibraHelp open={libraOpen} onClose={() => setLibraOpen(false)} channelUrl={slackUrl(libra)} />

      {/* Polaris 현황 판 — 후보 깔때기·당월 청구·스팟·최근 후보를 뺐다 (민열님 0919).
          남는 건 숫자로 성장을 말하는 것뿐이다. 부품과 계산은 Polaris.tsx · lib/polaris.ts 에 있다. */}
      <Polaris onGo={onGo} />

      {/* Satty — 기능을 해치지 않는 여백(우하단)에 산다. 숫자가 좋으면 기뻐하고 막히면 지친다 (민열님 0919). */}
      <Satty status={status} weekItems={weekCount} onGo={onGo} />

      <p className="text-[12px] text-gray-400 mt-6">Castor 는 Visual Engineer 합류 후 다시 봅니다.</p>
    </div>
  );
}
