"use client";

import { useState } from "react";
import { IconBrandInstagram, IconFileDescription, IconWorld } from "@tabler/icons-react";
import { GATE_A, PHASES, SITE_URL, gateProgress, growth, type Period } from "@/lib/polaris";
import { usePolaris, type RecentPost } from "./usePolaris";
import { focusRing } from "./ui";

/**
 * Polaris 현황 판 — 메인 화면의 주인 자리 (민열님 0919 승인 시안 그대로).
 *
 * 전에는 후보 깔때기·당월 청구·스팟·최근 후보가 있었다. 뺐다. 남는 건 **숫자로 성장을 말하는 것**뿐이다.
 * 파트너 매장 · 이번 달 수익 · WAU · 쿠폰 전환율(연결 전) — 그리고 성장률과, 다음 행성까지 가는 우주선.
 *
 * 값이 없는 칸은 '—' 와 '연결 전' 이다. 0 을 지어내지 않는다. Probe 가 붙으면 저절로 채워진다.
 */

const won = (n: number) => n.toLocaleString();
const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;

function Delta({ pct, note }: { pct: number | null; note?: string }) {
  if (pct === null) return <span className="text-[11.5px] font-semibold text-gray-400">{note ? `— ${note}` : "—"}</span>;
  const up = pct > 0, flat = pct === 0;
  return <span className={`text-[11.5px] font-bold tabular-nums ${flat ? "text-gray-400" : up ? "text-emerald-600" : "text-red-600"}`}>{flat ? "—" : up ? "▲" : "▼"} {Math.abs(pct)}%</span>;
}

const CHK: Record<RecentPost["checkpoint"], string> = {
  D2: "bg-navy/[0.07] text-navy", D7: "bg-emerald-50 text-emerald-700", D14: "bg-amber-50 text-amber-800",
  done: "bg-gray-100 text-gray-500", waiting: "bg-gray-100 text-gray-400",
};

export default function Polaris({ onGo }: { onGo?: (target: string) => void }) {
  const d = usePolaris();
  const [period, setPeriod] = useState<Period>("week");
  const i = d.input;
  const rows = growth(i, period);
  const gate = gateProgress(i);
  const month = Number(d.period.slice(5));

  const card = "bg-white/85 backdrop-blur rounded-[18px] border border-white/70 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";
  const kpi = (label: string, value: string, sub: string, right: React.ReactNode, tag?: string, pct?: number, go?: string) => (
    <button type="button" onClick={() => go && onGo?.(go)} disabled={!go || !onGo}
      className={`${card} text-left p-4 enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_18px_36px_-26px_rgba(5,0,114,0.45)] transition-[transform,box-shadow] motion-reduce:transition-none disabled:cursor-default ${focusRing}`}>
      <div className="flex items-center justify-between gap-2"><span className="text-[12px] text-gray-500">{label}</span>{tag && <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-navy/[0.06] text-navy">{tag}</span>}</div>
      <div className={`text-[26px] font-bold tabular-nums tracking-[-0.02em] leading-none mt-2 ${value === "—" ? "text-gray-300" : "text-gray-900"}`}>{value}</div>
      <div className="flex items-baseline justify-between gap-2 mt-2 text-[11.5px] text-gray-500"><span className="truncate">{sub}</span>{right}</div>
      {pct !== undefined && <div className="h-[6px] rounded-full bg-black/[0.05] overflow-hidden mt-2"><div className="h-full rounded-full bg-[linear-gradient(90deg,#050072,#6366E0)] transition-[width] duration-700" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>}
    </button>
  );

  const paidPct = i.revenue.billed > 0 ? Math.round((i.revenue.paid / i.revenue.billed) * 100) : 0;
  const shipLeft = gate.pct === null ? 8 : 8 + (50 - 8) * gate.pct;

  return (
    <section aria-label="Polaris 현황" className="mt-8">
      <div className="flex items-baseline gap-2 mb-3 flex-wrap">
        <h2 className="text-[15px] font-bold text-gray-900 tracking-[-0.015em]">지금 우리는 어디에 있나</h2>
        <span className="text-[12px] text-gray-400">{month}월 · 각 판을 누르면 그 화면으로</span>
        <a href={SITE_URL} target="_blank" rel="noreferrer" className={`ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white border border-black/[0.08] text-[12px] font-semibold text-navy hover:border-navy/30 ${focusRing}`}><IconWorld size={14} aria-hidden="true" />wouldulike.kr</a>
      </div>

      {/* KPI 4 */}
      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpi("파트너 매장", d.loading ? "…" : d.failed.stores ? "—" : `${i.stores.total}곳`, d.failed.stores ? "매장 목록을 읽지 못했습니다 — 0 이 아니라 모름" : `유료 ${i.stores.paid} · 무료 ${i.stores.total - i.stores.paid}`, <Delta pct={rows[0].pct} note={rows[0].note} />, "Astro", i.stores.total ? (i.stores.paid / i.stores.total) * 100 : 0, "astro-ops")}
        {kpi(`${month}월 수익`, d.loading ? "…" : d.failed.invoices ? "—" : `${won(i.revenue.paid)}원`, d.failed.invoices ? "계산서 목록을 읽지 못했습니다 — 0 이 아니라 모름" : `청구 ${won(i.revenue.billed)} · 미수 ${won(Math.max(0, i.revenue.billed - i.revenue.paid))}`, <span className={`text-[11.5px] font-semibold ${d.unpaid ? "text-red-600" : "text-gray-400"}`}>{d.unpaid ? `미입금 ${d.unpaid}곳` : "회수 완료"}</span>, `회수 ${paidPct}%`, paidPct, "astro-billing")}
        {kpi("주간 활성 (WAU)", i.app.wau === undefined ? "—" : `${i.app.wau}명`, i.app.dauWau === undefined ? "Probe 연결 전" : `DAU/WAU ${i.app.dauWau}% · 20% 넘으면 습관`, <span className="text-[11.5px] text-gray-400">{i.app.openToStore !== undefined ? `앱→매장 ${i.app.openToStore}%` : ""}</span>, i.app.wau === undefined ? "연결 전" : "GA4", i.app.dauWau, "probe-app")}
        {kpi("쿠폰·스탬프 전환율", i.coupon.rate === undefined ? "—" : `${i.coupon.rate}%`, i.coupon.rate === undefined ? "발급 → 사용 · Probe 집계 붙으면 자동" : "발급 → 사용", <span className="text-[11.5px] text-gray-400">{i.coupon.rate === undefined ? "민찬 설계 중" : ""}</span>, i.coupon.rate === undefined ? "연결 전" : "Probe", i.coupon.rate, "probe-metrics")}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
        {/* 성장률 */}
        <div className={`${card} p-4`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-semibold text-gray-900">성장률 <span className="text-[11px] font-medium text-gray-400 ml-1">Polaris 인자 · 실시간</span></span>
            <span className="inline-flex p-0.5 rounded-full bg-black/[0.05]" role="group" aria-label="비교 단위">
              {(["week", "month"] as const).map((p) => <button key={p} type="button" onClick={() => setPeriod(p)} aria-pressed={period === p} className={`px-2.5 h-6 rounded-full text-[11.5px] font-semibold ${period === p ? "bg-white text-navy shadow-sm" : "text-gray-500"}`}>{p === "week" ? "주" : "월"}</button>)}
            </span>
          </div>
          <ul className="divide-y divide-black/[0.05]">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-3 py-2">
                <span className="flex-1 text-[12.5px] font-medium text-gray-900">{r.label}</span>
                <span className="text-[12px] tabular-nums text-gray-500">{r.before === undefined ? "—" : r.money ? won(r.before) : r.before} → <b className="text-gray-900">{r.now === undefined ? "—" : r.money ? won(r.now) : r.now}</b>{r.unit && r.now !== undefined ? r.unit : ""}</span>
                <span className="w-[5.5rem] text-right"><Delta pct={r.pct} note={r.note} /></span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-gray-400 mt-2">비교 기준은 4주 전 / 전월. <b className="text-gray-600">둘 다 있는 값만</b> 증감률을 냅니다. 인자는 <code className="text-[10.5px]">lib/polaris.ts</code> 한 파일에 있습니다.</p>
        </div>

        {/* 우주선 — 다크 밴드는 낮에도 어둡다. 이건 테마가 아니라 이 카드의 정체성이다. */}
        <div className="relative overflow-hidden rounded-[18px] text-white p-4 bg-[radial-gradient(900px_480px_at_85%_-10%,#0B0B9A,#050072_45%,#02003C)]">
          <svg className="absolute inset-0 w-full h-full opacity-50 pointer-events-none" viewBox="0 0 600 260" preserveAspectRatio="none" aria-hidden="true">
            <g fill="#C7C9F7"><circle cx="40" cy="30" r="1.4"/><circle cx="120" cy="80" r="1"/><circle cx="220" cy="24" r="1.8"/><circle cx="330" cy="60" r="1.1"/><circle cx="410" cy="18" r="1.5"/><circle cx="520" cy="44" r="1"/><circle cx="560" cy="120" r="1.6"/><circle cx="70" cy="200" r="1.2"/><circle cx="300" cy="230" r="1"/><circle cx="470" cy="210" r="1.4"/></g>
            <path d="M120 80 L220 24 L330 60" stroke="#C7C9F7" strokeWidth=".6" strokeDasharray="3 5" fill="none" opacity=".5"/>
          </svg>
          <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#C7C9F7]">Polaris · 우리가 향하는 방향</p>
          <p className="text-[15px] font-bold mt-1">다음 행성까지 — Gate A {gate.pct === null ? "미계측" : `${Math.round(gate.pct * 100)}%`}</p>

          <div className="relative h-[112px] my-4" role="img" aria-label={`P1에서 P2로 가는 중, 게이트 A ${gate.pct === null ? "미계측" : `${Math.round(gate.pct * 100)}%`}`}>
            <div className="absolute left-[6%] right-[6%] top-[60px] h-[2px] bg-[linear-gradient(90deg,rgba(199,201,247,.15),rgba(199,201,247,.6),rgba(199,201,247,.15))]" />
            {PHASES.map((p, idx) => {
              const left = [8, 50, 92][idx];
              const done = idx === 0, next = idx === 1;
              return (
                <div key={p.key} className="absolute top-[40px] -translate-x-1/2 text-center w-[120px]" style={{ left: `${left}%` }}>
                  <div className={`w-[40px] h-[40px] rounded-full mx-auto grid place-items-center text-[11px] font-bold border-2 ${done ? "bg-periwinkle border-periwinkle" : "border-[rgba(199,201,247,.55)] bg-white/[0.04]"} ${next ? "shadow-[0_0_0_6px_rgba(99,102,224,.18)]" : ""}`}>{p.key}</div>
                  <div className="text-[10.5px] text-[#C7C9F7] mt-1.5 whitespace-nowrap">{p.where} · {p.name}</div>
                </div>
              );
            })}
            {/* 우주선 — 오른쪽(P2)을 향한다. 분사선은 뒤에. */}
            <div className="absolute top-[30px] -translate-x-1/2 w-9 h-9 transition-[left] duration-1000 ease-[cubic-bezier(.16,1,.3,1)] motion-safe:animate-[sat-hover_2.4s_ease-in-out_infinite]" style={{ left: `${shipLeft}%` }}>
              <svg viewBox="0 0 36 36" className="w-9 h-9 drop-shadow-[0_0_8px_rgba(199,201,247,.6)]" aria-hidden="true"><path d="M32 18 L12 10 L16 18 L12 26 Z" fill="#fff"/><circle cx="18" cy="18" r="2.4" fill="#6366E0"/><path d="M10 18 H7" stroke="#C7C9F7" strokeWidth="2" strokeLinecap="round"/><path d="M10 15 H6" stroke="#C7C9F7" strokeWidth="1.2" strokeLinecap="round" opacity=".6"/><path d="M10 21 H6" stroke="#C7C9F7" strokeWidth="1.2" strokeLinecap="round" opacity=".6"/></svg>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
            {GATE_A.map((g) => { const v = g.measure(i); return (
              <div key={g.label} className="rounded-[10px] bg-white/[0.06] border border-[rgba(199,201,247,.22)] px-2 py-1.5">
                <p className="text-[10.5px] font-bold leading-tight">{g.label}</p>
                <p className="text-[10px] text-[#C7C9F7] mt-0.5 tabular-nums">{g.detail(i)}</p>
                <div className="h-[4px] rounded-full bg-white/[0.12] mt-1 overflow-hidden"><div className="h-full rounded-full bg-[#C7C9F7]" style={{ width: `${v === null ? 0 : v * 100}%` }} /></div>
              </div>
            ); })}
          </div>
          <p className="text-[10.5px] text-[#C7C9F7]/80 mt-2">진도 = 계측되는 조건의 평균. 미계측은 0 이 아니라 <b>분모에서 뺍니다</b> — 지금은 {gate.measured}/{gate.total} 조건만 셉니다.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
        {/* 최근 게시물 · 인사이트 */}
        <div className={`${card} p-4`}>
          <div className="flex items-baseline justify-between mb-2"><span className="text-[13px] font-semibold text-gray-900">최근 게시물 · 인사이트</span><button type="button" onClick={() => onGo?.("probe-reports")} className={`text-[12px] font-medium text-navy hover:underline rounded ${focusRing}`}>Probe 인사이트 →</button></div>
          {d.loading ? <p className="text-[12px] text-gray-400">읽는 중…</p> : d.failed.insights ? <p className="text-[12px] text-gray-400">Papillon 게시물을 읽지 못했습니다 — 새로고침하면 다시 읽습니다.</p> : d.posts.length === 0 ? <p className="text-[12px] text-gray-400">최근 3개월 안에 매장이 나온 게시물이 없습니다.</p> : (
            <ul className="divide-y divide-black/[0.05]">
              {d.posts.map((p) => (
                <li key={`${p.plan_id}-${p.restaurant_id}`} className="flex items-center gap-2 py-2">
                  <span className={`w-9 text-center text-[10.5px] font-bold rounded-md py-0.5 shrink-0 ${CHK[p.checkpoint]}`}>{p.checkpoint === "done" ? "끝" : p.checkpoint === "waiting" ? "대기" : p.checkpoint}</span>
                  <span className="flex-1 min-w-0"><span className="block text-[12.5px] font-medium text-gray-900 truncate">{p.topic}</span><span className="block text-[11px] text-gray-400 truncate">{p.store}{p.posted_at ? ` · ${md(p.posted_at.slice(0, 10))}` : ""}</span></span>
                  {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" aria-label="인스타그램에서 보기" className={`shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-full border border-black/[0.08] bg-white text-[11px] font-semibold text-navy hover:border-navy/30 ${focusRing}`}><IconBrandInstagram size={13} aria-hidden="true" />인스타</a>}
                  <button type="button" onClick={() => onGo?.(`probe-reports?open=${p.restaurant_id}`)} className={`shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-full border border-black/[0.08] bg-white text-[11px] font-semibold text-navy hover:border-navy/30 ${focusRing}`}><IconFileDescription size={13} aria-hidden="true" />{p.hasReport ? "리포트" : "리포트 만들기"}</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 상위 사용 매장 */}
        <div className={`${card} p-4`}>
          <div className="flex items-baseline justify-between mb-2"><span className="text-[13px] font-semibold text-gray-900">상위 사용 매장 <span className="text-[11px] font-medium text-gray-400 ml-1">{month}월</span></span><button type="button" onClick={() => onGo?.("probe-metrics")} className={`text-[12px] font-medium text-navy hover:underline rounded ${focusRing}`}>Probe 매장 지표 →</button></div>
          {d.topStores === undefined ? <p className="text-[12px] text-gray-400">{d.loading ? "읽는 중…" : "매장 지표를 읽지 못했습니다 — 0 이 아니라 모름입니다."}</p> : d.topStores.length === 0 ? <p className="text-[12px] text-gray-400">이번 달 사용 기록이 있는 매장이 아직 없습니다.</p> : (
            <ul className="divide-y divide-black/[0.05]">
              {d.topStores.map((s) => (
                <li key={s.restaurant_id}><button type="button" onClick={() => onGo?.(`probe-reports?open=${s.restaurant_id}`)} className={`w-full flex items-center gap-2 py-2 text-left rounded ${focusRing}`}>
                  <span className="flex-1 min-w-0 text-[12.5px] font-medium text-gray-900 truncate">{s.name}</span>
                  <span className="text-[11.5px] tabular-nums text-gray-500">쿠폰 {s.coupon} · 스탬프 {s.stamp}</span>
                  <span className={`text-[11.5px] font-bold tabular-nums ${s.revisit ? "text-emerald-600" : "text-gray-400"}`}>재방문 {s.revisit}</span>
                </button></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
