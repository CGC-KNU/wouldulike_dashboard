"use client";

import { useEffect, useState } from "react";
import { IconArrowUpRight, IconBrandSlack, IconFolder, IconMessageChatbot } from "@tabler/icons-react";
import { TOOLS, TOOL_ORDER, slackUrl, type ToolKey, type ToolMeta } from "@/lib/satellite";
import { focusRing, periodLocal, agoLabel } from "./ui";
import type { SatelliteStatus } from "./useSatelliteStatus";

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

export default function Launcher({ available, extras = [], userName, onSelect, status, onGo }: { available: ToolKey[]; extras?: LauncherExtra[]; userName: string; onSelect: (key: string) => void; status?: SatelliteStatus | null; onGo?: (target: string) => void }) {
  const [pulse, setPulse] = useState<Pulse>({});

  useEffect(() => {
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
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
  const hour = new Date().getHours();
  const greet = hour < 12 ? "좋은 아침이에요" : hour < 18 ? "좋은 오후예요" : "수고 많았어요";

  return (
    <div className="max-w-5xl mx-auto px-5 pt-10 pb-16">
      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[13px] font-semibold text-navy tracking-wide inline-flex items-center gap-1.5">
            {/* 세틀라이트 마크 — 상단 바·탭 아이콘과 같은 도형 */}
            <img src="/satellite/satellite_app.svg" alt="" width={18} height={18} className="w-[18px] h-[18px] rounded-[5px]" aria-hidden="true" />
            Satellite
          </p>
          <h1 className="text-[34px] md:text-[40px] font-bold text-gray-900 tracking-[-0.02em] leading-[1.1] mt-1 text-balance">
            {greet}, <span className="bg-[linear-gradient(90deg,#050072,#6366E0)] bg-clip-text text-transparent">{userName}</span>님.
          </h1>
          <p className="text-[15px] text-gray-500 mt-2">오늘 볼 도구를 고르세요. 카드의 숫자는 <span className="text-gray-700 font-medium">지금 막힌 일</span>입니다.</p>
        </div>
      </header>

      {/* 툴 — **작게, 한눈에** (민열님 0914). 갤러리를 쓰면 카드가 커서 화면의 절반을 먹고
          여섯 개 중 셋만 보였다. 여기는 자리를 줄이고 아래 현황에 자리를 넘긴다.
          카드에 남는 숫자는 **지금 막힌 것**뿐이다 — 총량은 아래 현황이 맡는다. */}
      <ul aria-label="툴" className="sat-stagger grid grid-cols-2 md:grid-cols-3 gap-2.5">
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
        <ul aria-label="그 밖의 제품" className="mt-5 grid grid-cols-1 gap-2">
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

      {/* 현황 — 화면의 주인 자리 (민열님 0914: "하단 대시보드가 더 잘 보이게, 시각화").
          숫자만 네 개 늘어놓으면 어디가 문제인지 안 보인다. 각 숫자에 **그 숫자가 어떻게 생겼는지**를 붙인다.
          그림은 전부 지금 있는 값으로 그린다 — 새 API 도, 지어낸 값도 없다. */}
      {status && (
        <section aria-label="현황" className="mt-8">
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="text-[15px] font-bold text-gray-900 tracking-[-0.015em]">현황</h2>
            <span className="text-[12px] text-gray-400">{Number((status.billing?.period ?? periodLocal()).slice(5))}월 · 각 판을 누르면 그 화면으로</span>
          </div>

          <div className="sat-stagger grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* ── 후보 파이프라인 — '진행 후보 86' 하나로는 어디 막혔는지 모른다 */}
            <Panel title="파트너 후보" total={status.leads?.active} unit="명"
              note={status.leads ? `미팅 잡힘 ${status.leads.meetings} · 7일 이상 멈춤 ${status.leads.stale}` : undefined}
              alert={Boolean(status.leads?.stale)} onClick={() => onGo?.("astro-leads")}>
              <Funnel rows={status.leads?.funnel ?? []} />
            </Panel>

            {/* ── 이번 달 청구 — 건수와 금액을 같이. 들어온 만큼 채워진다 */}
            <Panel title={`${Number((status.billing?.period ?? periodLocal()).slice(5))}월 청구`}
              total={status.billing?.amount.billed} unit="원" money
              note={status.billing ? `${status.billing.billed}건 중 입금 ${status.billing.paid} · 미확인 ${status.billing.unpaid}` : undefined}
              alert={Boolean(status.billing?.unpaid)} onClick={() => onGo?.("astro-billing")}>
              <Meter done={status.billing?.amount.paid ?? 0} all={status.billing?.amount.billed ?? 0}
                doneLabel="입금됨" restLabel="아직" />
            </Panel>

            {/* ── 매장 — 캠퍼스마다 어디까지 왔는지. 총량 하나로는 상권 진행이 안 보인다 */}
            <Panel title="파트너 매장" total={status.stores?.total} unit="곳"
              note={status.stores ? `유료 ${status.stores.paid} · 무료 ${status.stores.total - status.stores.paid}` : undefined}
              onClick={() => onGo?.("astro-ops")}>
              <Campuses rows={status.stores?.byCampus ?? []} />
              <Spark weeks={status.stores?.weeks ?? []} label="최근 8주 계약 시작" />
            </Panel>

            {/* ── 스팟 제작 — 계약이 끝이 아니라 촬영·편집·납품이 뒤에 붙는다 */}
            <Panel title="스팟 제작" total={status.spots?.live} unit="건"
              note={status.spots ? `계약 이후 ${status.spots.contracted} · 받을 돈 ${status.spots.unpaidAmount.toLocaleString()}원` : undefined}
              onClick={() => onGo?.("astro-spots")}>
              <Stages rows={status.spots?.stages ?? []} />
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
            <Recent title="최근 파트너" more={() => onGo?.("astro-ops")} empty="아직 없습니다" rows={(status.stores?.recent ?? []).map((r) => ({ key: String(r.id), a: r.name, b: [r.campus, r.tier].filter(Boolean).join(" · "), c: r.signed ? `계약 ${r.signed.slice(5).replace("-", "/")}` : agoLabel(r.updated), onClick: () => onGo?.(`astro-ops?open=${r.id}`) }))} />
            <Recent title="최근 후보 움직임" more={() => onGo?.("astro-leads")} empty="아직 없습니다" rows={(status.leads?.recent ?? []).map((r) => ({ key: r.id, a: r.name, b: r.owner ?? "", c: r.stage, onClick: () => onGo?.(`astro-leads?open=${r.id}`) }))} />
            <Recent title="이번 달 정산" more={() => onGo?.("astro-billing")} empty="이번 달 청구가 없습니다" rows={(status.billing?.rows ?? []).map((r) => ({ key: r.id, a: r.name, b: `${r.total.toLocaleString()}원`, c: r.paid_at ? "입금 확인" : r.status === "ISSUED" ? "발행 · 대기" : "품의", tone: r.paid_at ? "green" : r.status === "PENDING" ? "amber" : "blue", onClick: () => onGo?.("astro-billing") }))} />
          </div>
        </section>
      )}

      <p className="text-[12px] text-gray-400 mt-6">Probe 는 아직 초안이라 화면의 &lsquo;초안 데이터&rsquo; 표시를 같이 보세요. Castor 는 Visual Engineer 합류 후 다시 봅니다.</p>
    </div>
  );
}

/* ═══════════ 현황 판 부품 — 라이브러리 없이 CSS 와 SVG 로만 ═══════════ */

/** 판 하나. 큰 숫자 하나 + 한 줄 설명 + 그림. 누르면 그 화면으로 간다. */
function Panel({ title, total, unit, note, alert, onClick, children }: {
  title: string; total?: number; unit?: string; note?: string; alert?: boolean; money?: boolean;
  onClick?: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`text-left bg-white/85 backdrop-blur rounded-[18px] p-4 border border-white/70 shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-26px_rgba(5,0,114,0.45)] transition-[transform,box-shadow] motion-reduce:transition-none ${focusRing}`}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[13px] font-semibold text-gray-900">{title}</span>
        <span className="text-[22px] font-bold text-gray-900 tabular-nums tracking-[-0.02em] leading-none ml-auto">
          {total === undefined ? "—" : total.toLocaleString()}
          {unit && <span className="text-[12px] font-semibold text-gray-400 ml-0.5">{unit}</span>}
        </span>
      </div>
      {note && <p className={`text-[11.5px] mt-1 ${alert ? "text-red-600 font-semibold" : "text-gray-500"}`}>{note}</p>}
      <div className="mt-3">{children}</div>
    </button>
  );
}

/**
 * 후보 퍼널. 단계마다 가로 막대 하나 — **가장 많은 단계를 100% 로 잡는다.**
 * 총원 대비로 그리면 막대가 전부 짧아져서 어디가 두꺼운지 안 보인다.
 */
function Funnel({ rows }: { rows: { stage: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="grid gap-[3px]">
      {rows.map((r, i) => (
        <li key={r.stage} className="grid grid-cols-[58px_1fr_26px] items-center gap-2">
          <span className="text-[10.5px] text-gray-500 truncate">{r.stage}</span>
          <span className="h-[7px] rounded-full bg-black/[0.05] overflow-hidden">
            <span className="block h-full rounded-full transition-[width] duration-500"
              style={{ width: `${(r.n / max) * 100}%`,
                       background: `linear-gradient(90deg,#6366E0,#050072)`,
                       opacity: 0.45 + (i / Math.max(1, rows.length - 1)) * 0.55 }} />
          </span>
          <span className={`text-[11px] tabular-nums text-right ${r.n ? "text-gray-700 font-semibold" : "text-gray-300"}`}>{r.n}</span>
        </li>
      ))}
    </ul>
  );
}

/** 채움 막대. 이번 달 청구액 중 실제로 들어온 만큼. 0 원일 때 100% 로 보이지 않게 막는다. */
function Meter({ done, all, doneLabel, restLabel }: { done: number; all: number; doneLabel: string; restLabel: string }) {
  const pct = all > 0 ? Math.round((done / all) * 100) : 0;
  return (
    <div>
      <div className="h-[10px] rounded-full bg-black/[0.05] overflow-hidden">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#2BBE9B,#1C9C7E)] transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-baseline justify-between mt-1.5 text-[11px]">
        <span className="text-libra-deep font-semibold tabular-nums">{doneLabel} {done.toLocaleString()}원</span>
        <span className="text-gray-400 tabular-nums">{restLabel} {Math.max(0, all - done).toLocaleString()}원 · {pct}%</span>
      </div>
    </div>
  );
}

/** 캠퍼스별 유료/무료. 한 줄에 두 색을 붙여 놓아 어디가 돈이 되는 상권인지 바로 보인다. */
function Campuses({ rows }: { rows: { campus: string; paid: number; free: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.paid + r.free));
  return (
    <ul className="grid gap-1.5">
      {rows.map((r) => (
        <li key={r.campus} className="grid grid-cols-[46px_1fr_auto] items-center gap-2">
          <span className="text-[10.5px] text-gray-500 truncate">{r.campus}</span>
          <span className="h-[7px] rounded-full bg-black/[0.05] overflow-hidden flex">
            <span className="h-full bg-navy" style={{ width: `${(r.paid / max) * 100}%` }} />
            <span className="h-full bg-periwinkle/35" style={{ width: `${(r.free / max) * 100}%` }} />
          </span>
          <span className="text-[11px] tabular-nums text-gray-500">
            <b className="text-gray-900 font-semibold">{r.paid}</b>
            <span className="text-gray-300"> / {r.paid + r.free}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 8주 계약 시작 추이. 값이 전부 0 이면 그리지 않는다 — 빈 그래프는 없는 것보다 나쁘다. */
function Spark({ weeks, label }: { weeks: number[]; label: string }) {
  if (!weeks.length || weeks.every((n) => n === 0)) return null;
  const max = Math.max(...weeks);
  return (
    <div className="mt-3 pt-3 border-t border-black/[0.05]">
      <div className="flex items-end gap-[3px] h-[26px]" aria-hidden="true">
        {weeks.map((n, i) => (
          <span key={i} className="flex-1 rounded-t-[2px] bg-navy/70"
            style={{ height: `${Math.max(8, (n / max) * 100)}%`, opacity: 0.35 + (i / (weeks.length - 1)) * 0.65 }} />
        ))}
      </div>
      <p className="text-[10.5px] text-gray-400 mt-1.5">{label} · 합 {weeks.reduce((a, b) => a + b, 0)}곳</p>
    </div>
  );
}

/** 스팟 단계. 사람이 적어 막대보다 점이 읽기 쉽다 — 건수가 그대로 보인다. */
function Stages({ rows }: { rows: { stage: string; n: number }[] }) {
  const live = rows.some((r) => r.n > 0);
  if (!live) return <p className="text-[11.5px] text-gray-400">진행 중인 제작 건이 없습니다.</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {rows.map((r) => (
        <li key={r.stage}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border ${r.n ? "border-navy/20 bg-navy/[0.05] text-gray-800 font-semibold" : "border-black/[0.06] text-gray-300"}`}>
          {r.stage}<span className="tabular-nums">{r.n}</span>
        </li>
      ))}
    </ul>
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
