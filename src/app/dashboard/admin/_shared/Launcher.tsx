"use client";

import { useEffect, useState } from "react";
import { IconArrowUpRight, IconBrandSlack, IconFolder, IconMessageChatbot } from "@tabler/icons-react";
import { TOOLS, TOOL_ORDER, slackUrl, type ToolKey, type ToolMeta } from "@/lib/satellite";
import { focusRing, periodLocal } from "./ui";
import type { SatelliteStatus } from "./useSatelliteStatus";
import WeekIssues from "./WeekIssues";
import { greetingFor, addressee } from "./greeting";
import Polaris from "./Polaris";
import Satty from "./Satty";

/**
 * 세틀라이트 런처.
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

export default function Launcher({ available, extras = [], userName, username = "", userTitle, onSelect, status, onGo }: { available: ToolKey[]; extras?: LauncherExtra[]; userName: string; username?: string; userTitle?: string | null; onSelect: (key: string) => void; status?: SatelliteStatus | null; onGo?: (target: string) => void }) {
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

  const tools = TOOL_ORDER.map((k) => TOOLS[k]).filter((t) => t.status !== "external" && available.includes(t.key));
  const libra = TOOLS.libra;
  /**
   * 인사말은 **처음 그릴 때 한 번만** 정한다 (민열님 0919). 다시 그릴 때마다 계산하면
   * 자정이나 정각을 넘기는 순간 글자가 슬쩍 바뀌어 눈에 걸린다.
   */
  const [greet] = useState(() => greetingFor());
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
            {greet}, <span className="bg-[linear-gradient(90deg,#050072,#6366E0)] bg-clip-text text-transparent">{who.name}</span>{who.suffix}.
            {/* 직함은 이름 뒤 한 칸. 크기를 낮춰 이름이 먼저 읽히게 둔다 (민열님 0919). */}
            {userTitle && <span className="ml-2 align-middle text-[14px] md:text-[15px] font-bold text-navy/55 tracking-[-0.01em]">{userTitle}</span>}
          </h1>
          <p className="text-[15px] text-gray-500 mt-2">오늘 볼 도구를 고르세요. 카드의 숫자는 <span className="text-gray-700 font-medium">지금 막힌 일</span>입니다.</p>
        </div>
      </header>

      {/* 왼쪽 이번 주 · 오른쪽 툴 (민열님 0919).
          폰에서는 위아래로 선다. **이번 주가 위**다 — 무엇이 걸려 있는지 보고 툴을 고르는 순서다.
          툴 칸은 좁아진 만큼 한 줄에 둘씩 간다(넓은 화면에서만 셋). */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] gap-4 lg:gap-5 items-start">
        <WeekIssues onGo={onGo} onCount={setWeekCount} />

        <div className="min-w-0">
      {/* 툴 — **작게, 한눈에** (민열님 0914). 갤러리를 쓰면 카드가 커서 화면의 절반을 먹고
          여섯 개 중 셋만 보였다. 여기는 자리를 줄이고 아래 현황에 자리를 넘긴다.
          카드에 남는 숫자는 **지금 막힌 것**뿐이다 — 총량은 아래 현황이 맡는다. */}
      <ul aria-label="툴" className="sat-stagger grid grid-cols-2 xl:grid-cols-3 gap-2.5">
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
                className={`group relative w-full h-full text-left bg-white/85 backdrop-blur rounded-[18px] p-3.5 border border-white/70 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_14px_30px_-26px_rgba(5,0,114,0.5)] transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-24px_rgba(5,0,114,0.45)] active:translate-y-0 motion-reduce:transition-none ${focusRing} ${hold ? "opacity-70 hover:opacity-100" : ""}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <img src={`/satellite/${t.key}_app.svg`} alt="" width={40} height={40} className="w-10 h-10 rounded-[12px] shrink-0 shadow-[0_6px_16px_-10px_rgba(5,0,114,0.6)]" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold text-gray-900 tracking-[-0.015em] leading-tight truncate">{t.name}</span>
                    <span className="block text-[11.5px] font-medium text-gray-500 truncate">{t.subtitle}</span>
                  </span>
                  {/* 막힌 게 있으면 숫자, 없으면 상태 한 마디. 둘 다 놓으면 눈이 갈 곳이 없다. */}
                  {blocked > 0
                    ? <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-600 text-white text-[11.5px] font-bold tabular-nums grid place-content-center">{blocked}</span>
                    : <span className={`shrink-0 text-[10.5px] font-semibold ${st.cls}`}>{st.label}</span>}
                </div>
                <p className="text-[11.5px] text-gray-400 mt-2.5 leading-[1.5] line-clamp-1">{t.description}</p>
              </button>
            </li>
          );
        })}
      </ul>

      {/* 세틀라이트 밖 제품(Drive 등) — 권한과 무관하게 모두가 여는 것이라 카드가 아니라 줄로. */}
      {extras.length > 0 && (
        <ul aria-label="그 밖의 제품" className="mt-2.5 grid grid-cols-1 gap-2">
          {/* grid-cols-1 이 있어야 한다. 칸을 안 정하면 트랙이 내용 폭(max-content)으로 늘어나
              폰에서 스트립이 화면 밖으로 나간다 — 390px 에서 24px 넘쳤다 (0914). */}
          {extras.map((e) => (
            <li key={e.key} className="min-w-0">
              <button type="button" onClick={() => onSelect(e.key)} className={`w-full text-left rounded-[18px] border border-white/70 bg-white/70 backdrop-blur px-5 py-3.5 flex items-center gap-3 hover:border-navy/20 transition-colors ${focusRing}`}>
                <IconFolder size={20} className="text-navy shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-gray-900 tracking-[-0.01em]">{e.name}{e.subtitle && <span className="text-[12px] font-medium text-gray-500 ml-1.5">{e.subtitle}</span>}</span>
                  {e.description && <span className="block text-[12px] text-gray-500 mt-0.5 truncate">{e.description}</span>}
                </span>
                <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-navy shrink-0">열기 <IconArrowUpRight size={14} aria-hidden="true" /></span>
              </button>
            </li>
          ))}
        </ul>
      )}

        </div>
      </div>

      {/* Libra — 고르는 툴이 아니라 전체를 받치는 층. 그래서 카드가 아니라 스트립이다. */}
      <section aria-label="Libra" className="mt-6 rounded-[22px] border border-libra/30 bg-[linear-gradient(135deg,rgba(43,190,155,0.10),rgba(127,233,203,0.16))] backdrop-blur px-5 py-4 flex flex-wrap items-center gap-4">
        <span aria-hidden="true" className="w-11 h-11 rounded-[14px] shrink-0 bg-[linear-gradient(135deg,#7FE9CB,#2BBE9B)] shadow-[0_8px_20px_-12px_rgba(18,131,106,0.8)] flex items-center justify-center">
          {/* 앱판 아이콘은 네이비 면이라 그대로 쓰면 민트가 가려진다 — 선 버전을 마스크로 삼아 흰 저울만 얹는다 */}
          <span className="block w-7 h-7 bg-white" style={{ WebkitMaskImage: "url(/satellite/libra.svg)", maskImage: "url(/satellite/libra.svg)", WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-libra-deep tracking-[-0.01em]">{libra.name} <span className="text-[12px] font-medium text-gray-500 ml-1">모든 툴을 슬랙에서 보조합니다</span></p>
          <p className="text-[12px] text-gray-500 mt-0.5">
            <code className="bg-white/80 px-1.5 py-0.5 rounded text-[11px] text-libra-deep font-semibold">?현황</code> <code className="bg-white/80 px-1.5 py-0.5 rounded text-[11px] text-libra-deep font-semibold">?매장</code> <code className="bg-white/80 px-1.5 py-0.5 rounded text-[11px] text-libra-deep font-semibold">@Libra</code> · 아침 브리핑 · 추첨 D-1 알림 · 리포트 시점 태그
          </p>
        </div>
        <a href={slackUrl(libra)} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white text-[13px] font-semibold text-libra-deep border border-libra/30 hover:border-libra shadow-sm ${focusRing}`}>
          <IconBrandSlack size={15} aria-hidden="true" /> #{libra.slack.channel}
        </a>
        <span className="hidden md:inline-flex items-center gap-1 text-[12px] text-gray-400"><IconMessageChatbot size={14} aria-hidden="true" /> 웹 화면 없음</span>
      </section>

      {/* Polaris 현황 판 — 후보 깔때기·당월 청구·스팟·최근 후보를 뺐다 (민열님 0919).
          남는 건 숫자로 성장을 말하는 것뿐이다. 부품과 계산은 Polaris.tsx · lib/polaris.ts 에 있다. */}
      <Polaris onGo={onGo} />

      {/* Satty — 기능을 해치지 않는 여백(우하단)에 산다. 숫자가 좋으면 기뻐하고 막히면 지친다 (민열님 0919). */}
      <Satty status={status} weekItems={weekCount} onGo={onGo} />

      <p className="text-[12px] text-gray-400 mt-6">Probe 는 아직 초안이라 화면의 &lsquo;초안 데이터&rsquo; 표시를 같이 보세요. Castor 는 Visual Engineer 합류 후 다시 봅니다.</p>
    </div>
  );
}
