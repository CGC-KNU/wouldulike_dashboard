"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { Button, Card, Empty, Kpi, Notice, PanelSection, Skeleton, Table, Td, Th } from "../_shared/ui";
import type { SummaryPayload, Trend, TrendMonth, TrendPoint } from "@/app/api/probe/insights/summary/route";
import { DOT_MONTHS, axisTicks, compactKo, monthBounds, monthTick, niceMax } from "@/lib/draft/insightsTrend";

/**
 * Probe · 인스타 성과 **추이** — 매장 리포트 화면 아래.
 *
 * 1006 개편(민찬): 위는 **얼마나 올렸나**(최근 4주 · 월별 발행 수), 아래는 **한 편이 얼마나 나갔나**(게시물별 점).
 *
 * 예전 표는 "D7 이면 같은 시점"이라고 믿고 월 합계·중앙값을 냈다. 그런데 정밀 수집이 9/10 에 처음 돌면서
 * 그 전 게시물의 D7 이 그날 값으로 한꺼번에 찍혔다 — 몇 주~몇 달 쌓인 값이 7일차 자리에 있었다.
 * 그래서 지금은:
 *  · 7일차 = 게시 후 7~9일에 잰 값만(백엔드 trend). 채운 점.
 *  · 7일차가 없는 게시물은 **지금까지 쌓인 값**을 속 빈 회색 점으로 — 보이되 견주지 않게. 중앙값에도 안 넣는다.
 *  · 합계(조회 합·저장 합)는 뺐다. 발행 수와 릴스 비중을 따라 움직여서 "잘하고 있나"에 답하지 못한다.
 *  · 판정 글(좋아짐·나빠짐)은 붙이지 않는다 — Probe 화면에서 판정을 걷어 낸 흐름(#240·#243)과 같다.
 */

/** 포맷 순서는 고정 — 색이 포맷을 따라간다. 기간이 바뀌어도 카드뉴스는 늘 같은 색이다. */
const FORMATS = ["carousel", "reel", "image"] as const;
const FORMAT_KO: Record<string, string> = { carousel: "카드뉴스", reel: "릴스", image: "기타" };
const COLOR: Record<string, string> = { carousel: "var(--chart-carousel)", reel: "var(--chart-reel)", image: "rgb(var(--g-400))" };
const n = (v: number | null | undefined) => (typeof v === "number" ? v.toLocaleString() : "—");
const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };

export default function InsightsSummary() {
  const [data, setData] = useState<SummaryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/probe/insights/summary")
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).detail ?? "읽지 못했습니다"))))
      .then(setData)
      .catch((e: Error) => { setData(null); setError(e.message); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  return (
    <PanelSection
      title="인스타 성과 추이"
      actions={<Button size="sm" icon={<IconRefresh />} onClick={load} disabled={loading}>다시 읽기</Button>}
    >
      {loading && !data ? (
        <Skeleton rows={4} />
      ) : error ? (
        <Notice tone="amber" title="성과 추이를 읽지 못했습니다">{error} — 숫자가 0 이라는 뜻이 아닙니다.</Notice>
      ) : !data || data.no_data ? (
        <Empty title="아직 발행된 게시물이 없습니다" />
      ) : !data.trend ? (
        <Notice tone="amber" title="백엔드가 아직 새 추이를 주지 않습니다">백엔드 배포가 끝나면 「다시 읽기」를 눌러 주세요.</Notice>
      ) : (
        // 다시 읽는 동안 그림을 지우지 않고 흐리게 둔다 — 자리가 튀지 않게
        <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          <TrendView trend={data.trend} />
        </div>
      )}
    </PanelSection>
  );
}

function TrendView({ trend }: { trend: Trend }) {
  const { recent, months, points, counts } = trend;
  const present = FORMATS.filter((f) => months.some((m) => m.by_format[f]));

  // 점 그림 기간 — 이번 달 포함 최근 DOT_MONTHS 개월
  const dotMonths = months.slice(-DOT_MONTHS);
  const range: [number, number] | null = dotMonths.length ? [monthBounds(dotMonths[0].period)[0], monthBounds(dotMonths[dotMonths.length - 1].period)[1]] : null;
  const inRange = (p: TrendPoint) => range !== null && Date.parse(p.posted_at) >= range[0];
  const dotFormats = FORMATS.filter((f) => points.some((p) => p.format === f && inRange(p) && (p.basis === "d7" || p.basis === "late")));
  const pendingIn = points.filter((p) => inRange(p) && p.basis === "pending").length;
  const noneIn = points.filter((p) => inRange(p) && p.basis === "none").length;
  const before = points.filter((p) => !inRange(p)).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2.5">
        <Kpi label="최근 4주 발행" value={recent.posts} suffix="건" hint={recent.by_format.image ? `기타 ${recent.by_format.image}건 포함` : `오늘까지 ${recent.days}일`} />
        <Kpi label="릴스" value={recent.by_format.reel ?? 0} suffix="건" hint="최근 4주" />
        <Kpi label="카드뉴스" value={recent.by_format.carousel ?? 0} suffix="건" hint="최근 4주" />
      </div>

      <Card
        title="월별 발행 수"
        description={`${months[0]?.label ?? ""} ~ ${months[months.length - 1]?.label ?? ""}${trend.archived_excluded ? ` · 인스타에서 지운 ${trend.archived_excluded}건은 뺐습니다` : ""}`}
        actions={<Legend items={present.map((f) => ({ key: f, label: FORMAT_KO[f], swatch: <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: COLOR[f] }} /> }))} />}
      >
        {months.length ? <VolumeChart months={months} formats={present} /> : <Empty title="발행된 게시물이 없습니다" />}
      </Card>

      <Card title="게시물 한 편 조회수" description={`최근 ${DOT_MONTHS}개월 · 점 하나가 게시물 하나 · 누르면 인스타에서 열립니다`}>
        <div className="mb-3">
          <Legend
            items={[
              { key: "d7", label: "7일차 (게시 후 7~9일에 잰 값)", swatch: <svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="4.5" fill="rgb(var(--g-700))" /></svg> },
              { key: "late", label: "늦게 잰 값 — 지금까지 쌓인 조회수, 견주지 않음", swatch: <svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="3.75" fill="none" stroke="rgb(var(--g-400))" strokeWidth="1.5" /></svg> },
              { key: "median", label: "월 중앙값 (7일차 5건부터)", swatch: <svg width="14" height="12" aria-hidden><line x1="1" y1="6" x2="13" y2="6" stroke="rgb(var(--g-700))" strokeWidth="2" strokeLinecap="round" /></svg> },
            ]}
          />
        </div>
        {range && dotFormats.length ? (
          <div className="grid lg:grid-cols-2 gap-x-6 gap-y-4">
            {dotFormats.map((f) => (
              <DotPanel key={f} fmt={f} points={points.filter((p) => p.format === f && inRange(p))} months={dotMonths} range={range} />
            ))}
          </div>
        ) : (
          <Empty title={`최근 ${DOT_MONTHS}개월에 그릴 게시물이 없습니다`} />
        )}
        <ul className="mt-3 space-y-1 text-[12px] text-gray-500 leading-relaxed">
          <li>정밀 수집이 9월 10일에 시작돼, 그 전에 올린 게시물은 7일차가 없습니다. 속 빈 점은 언제 잰 값인지가 제각각이라 서로 견주면 안 됩니다.</li>
          {pendingIn > 0 && <li>아직 7일이 안 된 {pendingIn}건은 7일차가 찍히면 점이 생깁니다.</li>}
          {noneIn > 0 && <li>수치가 한 번도 안 들어온 {noneIn}건은 그리지 않았습니다.</li>}
          {before > 0 && <li>그 전 {before}건은 위 월별 발행 수와 아래 표에만 있습니다.</li>}
          {counts.d7 === 0 && <li>아직 7일차를 제때 잰 게시물이 없습니다.</li>}
        </ul>
      </Card>

      <MonthTable months={months} formats={present} />
    </div>
  );
}

/** 범례 — 두 개 이상이면 늘 둔다. 글자는 글자색, 색은 옆의 작은 표식만 가진다. */
function Legend({ items }: { items: { key: string; label: string; swatch: ReactNode }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-600">
      {items.map((it) => (
        <li key={it.key} className="inline-flex items-center gap-1.5">{it.swatch}{it.label}</li>
      ))}
    </ul>
  );
}

/* ═══════════ 월별 발행 수 — 쌓은 막대 ═══════════ */

const VOL_H = 140;

function VolumeChart({ months, formats }: { months: TrendMonth[]; formats: readonly string[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const top = niceMax(Math.max(0, ...months.map((m) => m.posts)));
  const ticks = axisTicks(top);
  const yPx = (v: number) => VOL_H - (v / top) * VOL_H;
  const hm = hover !== null ? months[hover] : null;
  const leftPct = hover !== null ? ((hover + 0.5) / months.length) * 100 : 0;

  return (
    <div className="flex">
      <div className="relative w-7 shrink-0" style={{ height: VOL_H }} aria-hidden>
        {ticks.map((v) => (
          <span key={v} className="absolute right-1.5 -translate-y-1/2 text-[10.5px] text-gray-400 tabular-nums" style={{ top: yPx(v) }}>{v}</span>
        ))}
      </div>
      <div className="relative flex-1 min-w-0">
        {ticks.map((v) => <div key={v} className="absolute inset-x-0 h-px bg-gray-100" style={{ top: yPx(v) }} aria-hidden />)}
        <div className="relative flex items-end" style={{ height: VOL_H }} onMouseLeave={() => setHover(null)}>
          {months.map((m, i) => {
            const parts = formats.filter((f) => m.by_format[f]);
            return (
              <button
                key={m.period}
                type="button"
                className="relative flex-1 h-full flex flex-col justify-end items-center outline-none focus-visible:bg-navy/[0.06] rounded-[4px]"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${m.label} 발행 ${m.posts}건${parts.length ? ` — ${parts.map((f) => `${FORMAT_KO[f]} ${m.by_format[f].posts}`).join(" · ")}` : ""}`}
              >
                {m.posts > 0 && (
                  // 아래부터 카드뉴스 → 릴스 → 기타. 칸 사이 2px 는 바탕색 틈이다(테두리가 아니라)
                  <span
                    className={`flex flex-col-reverse gap-[2px] w-[calc(100%-4px)] max-w-[24px] transition-opacity ${hover !== null && hover !== i ? "opacity-50" : ""}`}
                    style={{ height: (m.posts / top) * VOL_H }}
                  >
                    {parts.map((f, k) => (
                      <span key={f} className={`block min-h-[2px] ${k === parts.length - 1 ? "rounded-t-[4px]" : ""}`} style={{ flex: `${m.by_format[f].posts} 1 0`, background: COLOR[f] }} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex mt-1.5" aria-hidden>
          {months.map((m, i) => (
            <span key={m.period} className="flex-1 flex justify-center text-[10.5px] text-gray-400 tabular-nums whitespace-nowrap">{monthTick(m.period, i, months.length) ?? ""}</span>
          ))}
        </div>
        {hm && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-[10px] bg-white border border-black/[0.08] shadow-[0_8px_24px_-12px_rgba(5,0,114,0.35)] px-3 py-2 text-[12px] min-w-[8.5rem]"
            style={{ left: `${leftPct}%`, transform: `translateX(${leftPct < 18 ? "0" : leftPct > 82 ? "-100%" : "-50%"})` }}
          >
            <p className="text-gray-500">{hm.label}</p>
            <p className="text-[15px] font-bold text-gray-900 tabular-nums">발행 {hm.posts}건</p>
            {formats.filter((f) => hm.by_format[f]).map((f) => (
              <p key={f} className="flex items-center gap-1.5 text-gray-600 tabular-nums">
                <span className="inline-block w-3 h-[2px] rounded-full" style={{ background: COLOR[f] }} />
                <b className="font-semibold text-gray-900">{hm.by_format[f].posts}</b> {FORMAT_KO[f]}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════ 게시물별 조회수 — 점 ═══════════ */

/** 그림 너비를 재서 SVG 를 그 픽셀로 그린다 — viewBox 로 늘이면 글자까지 늘어난다. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const DOT_H = 180;
const PAD = { l: 40, r: 10, t: 14, b: 22 };

function DotPanel({ fmt, points, months, range }: { fmt: string; points: TrendPoint[]; months: TrendMonth[]; range: [number, number] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<TrendPoint | null>(null);
  const drawn = useMemo(() => points.filter((p) => (p.basis === "d7" || p.basis === "late") && p.views !== null), [points]);
  const medians = months
    .map((m) => ({ period: m.period, v: m.by_format[fmt]?.views_median ?? null, k: m.by_format[fmt]?.timely ?? 0 }))
    .filter((m): m is { period: string; v: number; k: number } => m.v !== null);
  const top = niceMax(Math.max(0, ...drawn.map((p) => p.views as number), ...medians.map((m) => m.v)));
  const innerW = Math.max(0, W - PAD.l - PAD.r);
  const now = Date.now();
  const x = (t: number) => PAD.l + ((Math.min(t, range[1]) - range[0]) / (range[1] - range[0])) * innerW;
  const y = (v: number) => PAD.t + (1 - v / top) * (DOT_H - PAD.t - PAD.b);
  const color = COLOR[fmt];
  const d7 = drawn.filter((p) => p.basis === "d7").length;
  const lastMedian = medians[medians.length - 1];

  return (
    <figure className="min-w-0">
      <figcaption className="mb-1">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-800">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} aria-hidden />
          {FORMAT_KO[fmt]}
          <span className="font-normal text-[12px] text-gray-500">· 7일차 {d7}건 · 늦게 잰 값 {drawn.length - d7}건</span>
        </span>
        {/* 중앙값 숫자는 그림 밖에 — 선 옆에 쓰면 그 달 점들과 겹친다 */}
        <span className="block text-[12px] text-gray-500 mt-0.5 tabular-nums">
          {lastMedian ? <>{Number(lastMedian.period.slice(5))}월 7일차 중앙값 <b className="font-semibold text-gray-800">{lastMedian.v.toLocaleString()}회</b> ({lastMedian.k}건)</> : "월 중앙값은 7일차가 한 달에 5건 모이면 나옵니다"}
        </span>
      </figcaption>
      <div ref={ref} className="relative" style={{ height: DOT_H }}>
        {W > 0 && (
          <svg width={W} height={DOT_H} className="block overflow-visible" role="img" aria-label={`${FORMAT_KO[fmt]} 게시물별 조회수 — 표는 아래 월별 표에 있습니다`}>
            {axisTicks(top).map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="rgb(var(--g-100))" strokeWidth="1" />
                <text x={PAD.l - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize="10.5" fill="rgb(var(--g-400))" className="tabular-nums">{compactKo(v)}</text>
              </g>
            ))}
            {months.map((m) => {
              const sx = x(monthBounds(m.period)[0]);
              return (
                <g key={m.period}>
                  <line x1={sx} x2={sx} y1={PAD.t} y2={DOT_H - PAD.b} stroke="rgb(var(--g-100))" strokeWidth="1" />
                  <text x={sx + 3} y={DOT_H - 6} fontSize="10.5" fill="rgb(var(--g-400))">{Number(m.period.slice(5))}월</text>
                </g>
              );
            })}
            {/* 월 중앙값 — 7일차를 제때 잰 값 5건부터. 늦게 잰 값은 들어가지 않는다 */}
            {medians.map((m) => {
              const [s, e] = monthBounds(m.period);
              return <line key={m.period} x1={x(s) + 2} x2={x(Math.min(e, now)) - 2} y1={y(m.v)} y2={y(m.v)} stroke={color} strokeWidth="2" strokeLinecap="round" />;
            })}
            {/* 늦게 잰 값을 먼저 깔고 7일차를 위에 — 비교할 점이 가려지지 않게 */}
            {drawn.filter((p) => p.basis === "late").map((p) => (
              <circle key={p.id} cx={x(Date.parse(p.posted_at))} cy={y(p.views as number)} r="3.75" fill="rgb(var(--card))" stroke="rgb(var(--g-400))" strokeWidth="1.5" opacity={hover && hover.id !== p.id ? 0.5 : 1} />
            ))}
            {drawn.filter((p) => p.basis === "d7").map((p) => (
              <circle key={p.id} cx={x(Date.parse(p.posted_at))} cy={y(p.views as number)} r={hover?.id === p.id ? 6 : 4.5} fill={color} stroke="rgb(var(--card))" strokeWidth="2" />
            ))}
            {/* 맞히기 쉬운 자리 — 점보다 크게(지름 24px) */}
            {drawn.map((p) => (
              <circle
                key={`hit-${p.id}`}
                cx={x(Date.parse(p.posted_at))}
                cy={y(p.views as number)}
                r="12"
                fill="transparent"
                className="cursor-pointer outline-none"
                tabIndex={0}
                role="link"
                aria-label={`${md(p.posted_at)} ${FORMAT_KO[fmt]} 조회 ${n(p.views)}회 — ${p.basis === "d7" ? "7일차" : `게시 후 ${p.measured_days}일째까지 쌓인 값`}`}
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(p)}
                onBlur={() => setHover(null)}
                onClick={() => p.permalink && window.open(p.permalink, "_blank", "noopener")}
                onKeyDown={(e) => { if (e.key === "Enter" && p.permalink) window.open(p.permalink, "_blank", "noopener"); }}
              />
            ))}
          </svg>
        )}
        {hover && W > 0 && <DotTip p={hover} left={x(Date.parse(hover.posted_at))} top={y(hover.views as number)} width={W} />}
      </div>
    </figure>
  );
}

function DotTip({ p, left, top, width }: { p: TrendPoint; left: number; top: number; width: number }) {
  const shift = left < width * 0.2 ? "0" : left > width * 0.8 ? "-100%" : "-50%";
  const below = top < 70; // 위쪽 점이면 툴팁을 아래로
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-[10px] bg-white border border-black/[0.08] shadow-[0_8px_24px_-12px_rgba(5,0,114,0.35)] px-3 py-2 text-[12px] w-max max-w-[15rem]"
      style={{ left, top, transform: `translate(${shift}, ${below ? "14px" : "calc(-100% - 14px)"})` }}
    >
      <p className="text-[15px] font-bold text-gray-900 tabular-nums">{n(p.views)}회</p>
      <p className="text-gray-600">{md(p.posted_at)} 게시 · {FORMAT_KO[p.format] ?? p.format}</p>
      <p className={p.basis === "d7" ? "text-gray-500" : "text-amber-700"}>
        {p.basis === "d7" ? `7일차 (게시 후 ${p.measured_days}일에 잼)` : `게시 후 ${p.measured_days}일째까지 쌓인 값 — 견주지 않음`}
      </p>
    </div>
  );
}

/* ═══════════ 월별 표 — 그림의 표 버전 ═══════════ */

function MonthTable({ months, formats }: { months: TrendMonth[]; formats: readonly string[] }) {
  const medianFormats = formats.filter((f) => f !== "image");
  return (
    <details className="group">
      <summary className="cursor-pointer select-none text-[12.5px] font-semibold text-gray-600 hover:text-gray-900 w-fit">
        월별 표 <span className="text-gray-400 font-normal">— 그림의 숫자를 표로</span>
      </summary>
      <div className="mt-2">
        <Card flush>
          <Table minWidth="36rem">
            <thead>
              <tr>
                <Th>월</Th>
                <Th align="right">발행</Th>
                {formats.map((f) => <Th key={f} align="right">{FORMAT_KO[f]}</Th>)}
                {medianFormats.map((f) => <Th key={`m-${f}`} align="right">{FORMAT_KO[f]} 7일차 조회 중앙값</Th>)}
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.period}>
                  <Td><span className="font-medium text-gray-900">{m.label}</span></Td>
                  <Td align="right" numeric>{m.posts}</Td>
                  {formats.map((f) => <Td key={f} align="right" numeric className={m.by_format[f] ? "" : "text-gray-300"}>{m.by_format[f]?.posts ?? 0}</Td>)}
                  {medianFormats.map((f) => {
                    const s = m.by_format[f];
                    return (
                      <Td key={`m-${f}`} align="right" numeric>
                        {s?.views_median != null ? n(s.views_median) : <span className="text-gray-300" title={s?.timely ? "7일차 5건 미만" : "7일차 없음"}>—</span>}
                        {s?.timely ? <span className="ml-1 text-[11px] text-gray-400">{s.timely}건</span> : null}
                      </Td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <p className="mt-2 text-[11.5px] text-gray-500 leading-relaxed">
          중앙값은 7일차를 제때 잰 게시물이 5건 이상일 때만 냅니다 — 그보다 적으면 「—」입니다(0 이 아닙니다). 옆의 작은 숫자가 그 건수입니다.
        </p>
      </div>
    </details>
  );
}
