"use client";

import { useEffect, useMemo, useState } from "react";
import { IconFolder } from "@tabler/icons-react";
import { TOOLS, slackUrl, type ToolKey } from "@/lib/satellite";
import { growth } from "@/lib/polaris";
import { buildBlockers } from "@/lib/draft/blockers";
import type { Lead, StoreMetric, StoreRow, TaxInvoice } from "@/lib/draft/types";
import { focusRing, periodLocal, todayLocal } from "./ui";
import { fetchJson } from "./fetchJson";
import type { SatelliteStatus } from "./useSatelliteStatus";
import { usePolaris } from "./usePolaris";
import { greetingFor, addressee } from "./greeting";
import Satty from "./Satty";
import LibraHelp from "./LibraHelp";
import HomeStores from "./HomeStores";

/**
 * 세틀라이트 메인 (1121 민열님 개편).
 *
 *   1. Orbit · Atlas · Polaris 는 메인에서 뺀다.
 *   2. **현황이 맨 처음** — Probe 핵심 숫자 · 파트너 매장(막힌 일을 버튼 하나로) · 마케팅(인스타 매거진 성장 · 최근 동향)
 *   3. 앱은 일 이름으로 묶어 한 줄씩 — 앱 이름은 작게, 바로 들어간다.
 *
 * 숫자 계산은 원래 있던 것을 그대로 쓴다 — Probe · 매장은 usePolaris(lib/polaris growth), 막힌 일은 Astro 영업 홈과 같은 buildBlockers.
 * 못 읽은 칸은 0 이 아니라 「—」. 마케팅 요약은 백엔드 refs/summary(우리 팔로워 기록 · F&B 유행) + overview/performance(게시물 조회 흐름).
 */

export interface LauncherExtra { key: string; name: string; subtitle?: string; description?: string }

interface MarketingSummary {
  followers: number | null; media_count: number | null; since: string | null;
  growth_7d: number | null; growth_28d: number | null; spark: number[];
  trends: { name: string; use: string; refs: { handle: string; permalink: string }[] }[]; trend_src: "ai" | "tags"; trends_at: string | null;
  hot: { handle: string; name: string; followers: number | null; eng_rate: number | null }[];
  /** 우리 최근 게시물 — 오래된 것부터. views 는 7일차(basis D7) 아니면 지금까지 누적. vs_median 은 D7 끼리만 */
  posts?: RecentOwnPost[];
}
interface RecentOwnPost { posted_at: string; format: string; topic: string; permalink: string; views: number | null; saved: number | null; likes: number | null; basis: string; age_days: number; vs_median: number | null }
interface Momentum { available: boolean; delta_pct?: number; direction?: "up" | "down" | "flat"; format?: string; recent_median?: number; n?: number; min_n?: number }

const nf = new Intl.NumberFormat("ko-KR");
const won = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000) / 10}만` : nf.format(n));
const pctTxt = (p: number | null | undefined) => (p === null || p === undefined ? null : `${p > 0 ? "+" : ""}${p}%`);
const tile = `bg-white/85 backdrop-blur rounded-[16px] border border-white/70 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_14px_30px_-26px_rgba(5,0,114,0.5)]`;

/** 앱 묶음 — 일 이름이 먼저, 앱 이름은 꼬리표 (QA 1121 III). */
const GROUPS: { label: string; keys: ToolKey[] }[] = [
  { label: "영업 · 매장", keys: ["astro", "hubble"] },
  { label: "콘텐츠 · 마케팅", keys: ["papillon"] },
  { label: "데이터", keys: ["probe"] },
  { label: "개발", keys: ["aether", "castor"] },
];

export default function Launcher({ available, extras = [], userName, username = "", userTitle, onSelect, onPlayroom, status, onGo }: { available: ToolKey[]; extras?: LauncherExtra[]; userName: string; username?: string; userTitle?: string | null; onPlayroom?: () => void; onSelect: (key: string) => void; status?: SatelliteStatus | null; onGo?: (target: string) => void }) {
  const go = (t: string) => onGo?.(t);
  const [libraOpen, setLibraOpen] = useState(false);
  // 서버(UTC)에서 만들면 밤에 "좋은 아침" — 브라우저 시계로 붙은 뒤 한 번 정한다 (0919)
  const [greet, setGreet] = useState<string | null>(null);
  useEffect(() => { setGreet(greetingFor()); }, []);
  const who = addressee(username, userName);

  /* ── Probe · 매장 숫자 — Polaris 가 하던 계산 그대로 ── */
  const pol = usePolaris(true);
  const wk = useMemo(() => Object.fromEntries(growth(pol.input, "week").map((g) => [g.key, g])), [pol.input]);
  const mo = useMemo(() => Object.fromEntries(growth(pol.input, "month").map((g) => [g.key, g])), [pol.input]);

  /* ── 파트너 매장 막힌 일 — 영업 홈 「지금 막힌 것」과 같은 계산. fetchJson 이라 위 훅과 같은 주소는 한 번만 부른다 ── */
  const [astro, setAstro] = useState<{ stores: StoreRow[]; leads: Lead[]; invoices: TaxInvoice[]; failed: boolean } | null>(null);
  useEffect(() => {
    Promise.all([fetchJson<{ stores: StoreRow[] }>("/api/astro/stores"), fetchJson<{ leads: Lead[] }>("/api/astro/leads"), fetchJson<{ invoices: TaxInvoice[] }>(`/api/astro/invoices?period=${periodLocal()}`)])
      .then(([s, l, i]) => setAstro({ stores: s?.stores ?? [], leads: l?.leads ?? [], invoices: i?.invoices ?? [], failed: !s || !l || !i }));
  }, []);
  const blockers = useMemo(() => (astro ? buildBlockers(astro.stores, astro.leads, astro.invoices, periodLocal(), todayLocal()) : []), [astro]);
  const urgent = blockers.filter((b) => b.rank <= 1).length;
  /** 매장별 이번 달 쿠폰 · 스탬프 — Probe 매장 지표와 같은 응답(usePolaris 와 같은 주소라 한 번만 부른다). null = 못 읽음 */
  const [metrics, setMetrics] = useState<StoreMetric[] | null | undefined>(undefined);
  useEffect(() => { fetchJson<{ stores: StoreMetric[] }>("/api/probe/overview").then((d) => setMetrics(d ? d.stores : null)); }, []);

  /* ── 마케팅 ── */
  const [mkt, setMkt] = useState<MarketingSummary | null | undefined>(undefined);
  const [mom, setMom] = useState<Momentum | null | undefined>(undefined);
  useEffect(() => {
    fetchJson<MarketingSummary>("/api/satellite/refs/summary").then(setMkt);
    fetchJson<{ momentum_by_format?: Momentum[] }>("/api/satellite/overview/performance").then((d) =>
      setMom(d ? (d.momentum_by_format ?? []).find((m) => m.format === "carousel") ?? null : null));
  }, []);

  const groups = GROUPS.map((g) => ({ ...g, tools: g.keys.filter((k) => available.includes(k)).map((k) => TOOLS[k]) })).filter((g) => g.tools.length);
  const badge = (k: ToolKey) => (k === "astro" ? (status?.billing?.unpaid ?? 0) + (status?.leads?.stale ?? 0)
    : k === "probe" && status?.probe ? status.probe.due + status.probe.held : 0);

  return (
    <div className="max-w-6xl mx-auto px-5 pt-8 pb-16">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[13px] font-semibold text-navy tracking-wide inline-flex items-center gap-1.5">
            <img src="/satellite/satellite_app.svg" alt="" width={18} height={18} className="w-[18px] h-[18px] rounded-[5px]" aria-hidden="true" />
            Satellite
          </p>
          <h1 className="text-[28px] md:text-[32px] font-bold text-gray-900 tracking-[-0.02em] leading-[1.15] mt-1 text-balance">
            {greet ?? "안녕하세요"}, <span className="bg-[linear-gradient(90deg,#050072,#6366E0)] bg-clip-text text-transparent">{who.name}</span>{who.suffix}.
            {userTitle && <span className="ml-2 align-middle text-[14px] font-bold text-gray-500 tracking-[-0.01em]">{userTitle}</span>}
          </h1>
        </div>
        <p className="hidden sm:block text-[12.5px] text-gray-500">어디서든 <kbd className="px-1.5 py-0.5 rounded-md bg-black/[0.06] text-[11px] font-semibold text-gray-700">⌘K</kbd> 로 매장 · 화면 찾기</p>
      </header>

      {/* ① Probe 핵심 숫자 */}
      <section aria-labelledby="h-probe">
        <SectionHead id="h-probe" title="현황" note={pol.probeLoading ? "앱 지표 읽는 중…" : "주간 비교는 4주 전 같은 7일 대비"} action={{ label: "Probe 열기", onClick: () => go("probe-home") }} />
        <div className="sat-stagger grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <Num label="파트너 매장" value={pol.loading ? undefined : pol.input.stores.total} unit="곳" delta={pctTxt(wk.stores?.pct)} sub={`유료 ${pol.loading ? "—" : pol.input.stores.paid}곳`} onClick={() => go("astro-ops")} />
          <Num label="이번 달 입금" value={pol.loading ? undefined : pol.input.revenue.paid} money delta={pctTxt(mo.revenue?.pct)} sub={mo.revenue?.note ?? "전월 대비"} onClick={() => go("astro-billing")} />
          <Num label="WAU" value={pol.input.app.wau} unit="명" delta={pctTxt(wk.wau?.pct)} sub={wk.wau?.note ?? "주간 활성 사용자"} onClick={() => go("probe-app")} />
          <Num label="쿠폰 전환율" value={pol.input.coupon.rate} unit="%" sub="받은 쿠폰 중 사용" onClick={() => go("probe-app")} />
          <Num label="첫 주 재방문" value={pol.input.app.retentionW1} unit="%" sub="가입 다음 주에 다시" onClick={() => go("probe-app")} />
          <Num label="앱 → 매장" value={pol.input.app.openToStore} unit="%" sub="앱 연 사람 중 매장 방문" onClick={() => go("probe-app")} />
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* ② 파트너 매장 — 상권 탭 · 매장별 쿠폰 · 스탬프 · 할 일 (1121 2차) */}
        <section aria-labelledby="h-stores" className={`${tile} p-4 min-w-0`}>
          <SectionHead id="h-stores" title="파트너 매장" note={astro ? `할 일 ${blockers.filter((b) => b.kind !== "lead").length}건` : "읽는 중…"} action={{ label: "Astro 열기", onClick: () => go("astro-home") }} inner />
          <HomeStores stores={astro?.stores ?? null} metrics={metrics} blockers={blockers} leadStale={status?.leads?.stale} meetings={status?.leads?.meetings} onGo={go} />
        </section>

        {/* ③ 마케팅 — 인스타 매거진 성장 · 최근 동향 */}
        <section aria-labelledby="h-mkt" className={`${tile} p-4 min-w-0`}>
          <SectionHead id="h-mkt" title="마케팅 · 인스타 매거진" note="@w_ouldulike" action={{ label: "Papillon 열기", onClick: () => go("satellite") }} inner />
          <div className="grid grid-cols-3 gap-2">
            <Mini label="팔로워" value={mkt?.followers ?? undefined} sub={mkt === undefined ? "읽는 중" : mkt?.growth_28d !== null && mkt?.growth_28d !== undefined ? `28일 ${pctTxt(mkt.growth_28d)}` : mkt?.growth_7d !== null && mkt?.growth_7d !== undefined ? `7일 ${pctTxt(mkt.growth_7d)}` : "성장률은 기록 쌓는 중"} />
            <Mini label="7일 도달" value={pol.input.reach.last7} sub={wk.reach?.pct !== null && wk.reach?.pct !== undefined ? `4주 전 대비 ${pctTxt(wk.reach.pct)}` : wk.reach?.note ?? ""} title={wk.reach?.hint} />
            <Mini label="게시물 조회 흐름" value={mom?.available ? `${(mom.delta_pct ?? 0) > 0 ? "+" : ""}${mom.delta_pct}%` : undefined} sub={mom === undefined ? "읽는 중" : mom?.available ? "카드뉴스 최근 절반 vs 앞 절반" : "표본 모으는 중"} />
          </div>
          {mkt?.spark && mkt.spark.length > 2 && <Spark values={mkt.spark} />}
          {mkt?.posts && mkt.posts.length > 0 && <PostFlow posts={mkt.posts} onMore={() => go("satellite?screen=post-list")} />}
          <div className="mt-3 pt-3 border-t border-black/[0.06]">
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <p className="text-[11.5px] font-semibold text-gray-500">요즘 F&B 동향 {mkt?.trend_src === "tags" && "· 늘어난 해시태그"}</p>
              <button type="button" onClick={() => go("satellite?screen=refs")} className={`shrink-0 text-[12px] font-semibold text-navy hover:underline rounded ${focusRing}`}>레퍼런스 열기 →</button>
            </div>
            {!mkt?.trends?.length ? (
              <p className="text-[12.5px] text-gray-500">{mkt === undefined ? "읽는 중…" : "아직 정리된 동향이 없습니다 — 매일 새벽 갱신됩니다."}</p>
            ) : (
              <ol className="space-y-1.5">
                {mkt.trends.map((t, i) => (
                  <li key={i} className="text-[13px] leading-snug">
                    <span className="font-semibold text-gray-900">{t.name}</span>
                    {t.use && <span className="block text-[12px] text-gray-600 line-clamp-2">{t.use}</span>}
                  </li>
                ))}
              </ol>
            )}
            {mkt?.hot && mkt.hot.length > 0 && (
              <p className="mt-2.5 text-[12px] text-gray-500">뜨는 계정 · {mkt.hot.map((h) => (
                <a key={h.handle} href={`https://instagram.com/${h.handle}`} target="_blank" rel="noreferrer" className="text-navy font-semibold hover:underline mr-2">@{h.handle}</a>
              ))}</p>
            )}
          </div>
        </section>
      </div>

      {/* ④ 앱 — 일 이름으로 묶어 바로 들어가기 */}
      <section aria-labelledby="h-apps" className="mt-7">
        <SectionHead id="h-apps" title="바로 가기" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {groups.map((g) => (
            <div key={g.label} className={`${tile} p-2.5 min-w-0`}>
              <p className="px-1 pb-1.5 text-[11.5px] font-bold text-gray-500">{g.label}</p>
              <ul className="space-y-1">
                {g.tools.map((t) => {
                  const n = badge(t.key);
                  return (
                    <li key={t.key}>
                      <button type="button" onClick={() => onSelect(t.key)} title={t.description}
                        className={`w-full flex items-center gap-2.5 rounded-[11px] px-1.5 py-1.5 hover:bg-navy/[0.05] text-left ${focusRing} ${t.status === "hold" ? "opacity-70" : ""}`}>
                        <img src={`/satellite/${t.key}_app.svg`} alt="" width={30} height={30} className="w-[30px] h-[30px] rounded-[9px] shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-bold text-gray-900 truncate">{t.subtitle}</span>
                          <span className="block text-[11px] text-gray-500 truncate">{t.name}{t.status === "hold" ? " · 보류" : ""}</span>
                        </span>
                        {n > 0 && <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold tabular-nums grid place-content-center">{n}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <ul aria-label="그 밖" className="mt-2.5 flex flex-wrap gap-2">
          {extras.map((e) => (
            <li key={e.key}><button type="button" onClick={() => onSelect(e.key)} className={`h-9 px-3 rounded-full bg-white/80 border border-white/70 text-[12.5px] font-semibold text-gray-800 inline-flex items-center gap-1.5 hover:border-navy/20 ${focusRing}`}>
              <IconFolder size={15} aria-hidden="true" />{e.name}
            </button></li>
          ))}
          <li><button type="button" onClick={() => setLibraOpen(true)} className={`h-9 px-3 rounded-full bg-[linear-gradient(135deg,rgba(43,190,155,0.10),rgba(127,233,203,0.18))] border border-libra/30 text-[12.5px] font-semibold text-libra-deep ${focusRing}`}>
            {TOOLS.libra.name} 사용법
          </button></li>
          {onPlayroom && <li><button type="button" onClick={onPlayroom} className={`h-9 px-3 rounded-full bg-white/80 border border-white/70 text-[12.5px] font-semibold text-gray-800 hover:border-navy/20 ${focusRing}`}>세티랑 놀기</button></li>}
        </ul>
      </section>
      <LibraHelp open={libraOpen} onClose={() => setLibraOpen(false)} channelUrl={slackUrl(TOOLS.libra)} />

      {/* Satty — 막힌 일이 많으면 지친다 */}
      <Satty status={status} weekItems={urgent} onGo={onGo} />
    </div>
  );
}

function SectionHead({ id, title, note, action, inner }: { id: string; title: string; note?: string; action?: { label: string; onClick: () => void }; inner?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${inner ? "mb-3" : "mb-2.5"}`}>
      <h2 id={id} className="text-[15px] font-bold text-gray-900 tracking-[-0.01em]">{title}{note && <span className="ml-2 text-[12px] font-medium text-gray-500">{note}</span>}</h2>
      {action && <button type="button" onClick={action.onClick} className={`shrink-0 text-[12px] font-semibold text-navy hover:underline rounded ${focusRing}`}>{action.label} →</button>}
    </div>
  );
}

function Num({ label, value, unit, money, delta, sub, onClick }: { label: string; value: number | undefined; unit?: string; money?: boolean; delta?: string | null; sub?: string; onClick?: () => void }) {
  const down = delta?.startsWith("-");
  return (
    <button type="button" onClick={onClick} className={`${tile} px-3.5 py-3 text-left min-w-0 hover:-translate-y-0.5 transition-transform duration-200 motion-reduce:transition-none ${focusRing}`}>
      <span className="block text-[12px] font-semibold text-gray-500 truncate">{label}</span>
      <span className="mt-1 flex items-baseline gap-1.5 min-w-0">
        <span className="text-[22px] font-bold text-gray-900 tabular-nums tracking-[-0.02em] leading-none">{value === undefined ? "—" : money ? won(value) : nf.format(value)}</span>
        {value !== undefined && unit && <span className="text-[12px] font-semibold text-gray-500">{unit}</span>}
        {money && value !== undefined && <span className="text-[12px] font-semibold text-gray-500">원</span>}
        {delta && <span className={`ml-auto text-[12px] font-bold tabular-nums ${down ? "text-red-600" : "text-emerald-700"}`}>{delta}</span>}
      </span>
      {sub && <span className="block mt-1 text-[11px] text-gray-500 truncate">{sub}</span>}
    </button>
  );
}

function Mini({ label, value, sub, alert, onClick, title }: { label: string; value: number | string | undefined; sub?: string; alert?: boolean; onClick?: () => void; title?: string }) {
  const hot = alert && typeof value === "number" && value > 0;
  const body = (
    <>
      <span className="block text-[11.5px] font-semibold text-gray-500 truncate">{label}</span>
      <span className={`block text-[18px] font-bold tabular-nums leading-tight ${hot ? "text-red-600" : "text-gray-900"}`}>{value === undefined ? "—" : typeof value === "number" ? nf.format(value) : value}</span>
      {sub && <span className="block text-[11px] text-gray-500 truncate">{sub}</span>}
    </>
  );
  const cls = `rounded-[12px] px-3 py-2 text-left min-w-0 ${hot ? "bg-red-500/[0.06]" : "bg-black/[0.03]"}`;
  return onClick
    ? <button type="button" onClick={onClick} title={title} className={`${cls} hover:bg-black/[0.06] ${focusRing}`}>{body}</button>
    : <div className={cls} title={title}>{body}</div>;
}

/** 팔로워 28일 — 점 하나하나가 하루. 축 없이 흐름만. */
function Spark({ values }: { values: number[] }) {
  const w = 280, h = 36, min = Math.min(...values), max = Math.max(...values), span = Math.max(1, max - min);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 3 - ((v - min) / span) * (h - 6)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full h-9" role="img" aria-label={`팔로워 최근 ${values.length}일 흐름 ${nf.format(values[0])}에서 ${nf.format(values[values.length - 1])}`}>
      <polyline points={pts} fill="none" stroke="#3B37C8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w} cy={pts.split(" ").pop()!.split(",")[1]} r="3" fill="#3B37C8" />
    </svg>
  );
}

/**
 * 우리 최근 게시물 흐름(1121) — 막대 하나가 한 편, 왼쪽이 오래된 것. 높이 = 조회.
 * 7일차가 찬 글은 진한 남색, 아직 차는 중(누적)인 글은 옅게 — 둘을 같은 잣대로 보면 새 글이 늘 못나 보인다.
 */
function PostFlow({ posts, onMore }: { posts: RecentOwnPost[]; onMore: () => void }) {
  const max = Math.max(1, ...posts.map((p) => p.views ?? 0));
  const last = posts[posts.length - 1];
  return (
    <div className="mt-3 pt-3 border-t border-black/[0.06]">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <p className="text-[11.5px] font-semibold text-gray-500">우리 최근 게시물 {posts.length}편 · 조회 <span className="font-normal">(진한 막대 = 7일차 · 옅은 막대 = 아직 차는 중)</span></p>
        <button type="button" onClick={onMore} className={`shrink-0 text-[12px] font-semibold text-navy hover:underline rounded ${focusRing}`}>게시물 상세 열기 →</button>
      </div>
      <ol className="flex items-end gap-1.5 h-20" aria-label="최근 게시물 조회">
        {posts.map((p, i) => {
          const h = p.views === null ? 4 : Math.max(4, Math.round(((p.views ?? 0) / max) * 72));
          const d7 = p.basis === "D7";
          return (
            <li key={i} className="flex-1 min-w-0 h-full flex flex-col justify-end">
              <a href={p.permalink || undefined} target="_blank" rel="noreferrer" title={`${p.posted_at.slice(5, 10).replace("-", "/")} · ${p.topic}\n조회 ${p.views === null ? "아직 없음" : nf.format(p.views)}${p.saved !== null ? ` · 저장 ${p.saved}` : ""}${d7 ? " · 7일차" : ` · 게시 ${p.age_days}일째 누적`}${p.vs_median !== null ? ` · 평소의 ${p.vs_median}배` : ""}`}
                className={`block w-full rounded-t-[5px] ${d7 ? "bg-[#3B37C8]" : "bg-[#3B37C8]/35"} hover:opacity-80 ${focusRing}`} style={{ height: h }}>
                <span className="sr-only">{p.topic} 조회 {p.views ?? "없음"}</span>
              </a>
            </li>
          );
        })}
      </ol>
      <div className="flex gap-1.5 mt-1">
        {posts.map((p, i) => <span key={i} className="flex-1 min-w-0 text-center text-[10px] text-gray-400 tabular-nums">{p.posted_at.slice(5, 10).replace("-", "/")}</span>)}
      </div>
      {last && (
        <p className="mt-1.5 text-[12px] text-gray-600 truncate">
          최근 · <a href={last.permalink || undefined} target="_blank" rel="noreferrer" className="font-semibold text-gray-900 hover:underline">{last.topic || "(제목 없음)"}</a>
          {" "}조회 {last.views === null ? "—" : nf.format(last.views)}{last.basis !== "D7" && ` (${last.age_days}일째)`}
        </p>
      )}
    </div>
  );
}
