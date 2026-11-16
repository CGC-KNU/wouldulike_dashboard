"use client";

import { useEffect, useRef, useState } from "react";
import { IconChartBar, IconRefresh } from "@tabler/icons-react";
import { Button, Card, FilterPills, Notice, PageHeader, Skeleton } from "../_shared/ui";
import { Fold, TagChip, Unknown, takeParam } from "./kit";
import { flowOf, type Flow } from "@/lib/bigquery/liveShape";
import { BAR_NOW, BAR_PAST } from "./NowCard";
import { PERIOD_LABEL, type AppPeriod, type AppPeriodKey } from "@/lib/draft/appPeriods";
import AppReportPicker from "./AppReportPicker";

/**
 * Probe · 앱 지표.
 *
 * 매장 지표(쿠폰·스탬프)는 매장 쪽 절반이다. 나머지 절반, "학생이 앱을 켜고 돌아오는가"는 여기다.
 * 지어낸 숫자로 채우지 않는다 — 못 읽은 칸은 '-' 이고, 각 칸에 어디서 오는지(출처 칩)를 붙인다.
 *
 * 1013: 출처를 하나씩 붙이던 시기의 안내판(채워진 지표 · 연결된 출처 · 주요 지표 후보 KPI, 「데이터 출처」 표)을 걷어냈다.
 * 넷 다 붙어 있다. 위 KPI 는 주간 보고서 머리 지표와 같은 넷이다(appReportData `headline`).
 *
 * 1014: 칸마다 센 구간이 다르다(이번 달 · 7일 · 30일 …). 날짜를 설명 문장마다 따로 적던 것을 걷고, 숫자 밑 칩에
 * 「출처 · 기간」을 달고, 기간 → 날짜는 위 기간 줄 한 곳에 적는다. 구간 자체는 그대로다.
 *
 * 1015: 「주간 보고서」·「월간 보고서」 버튼을 걷고 기간 × 단위로 고르는 보고서(AppReportPicker)로 바꿨다.
 *
 * 1116 민찬: 직관적으로 · 지금의 흐름을 숫자 + 그래프로 · 간단하게(실시간 #389 · 매장 지표 #390 과 같은 결).
 *   ① 머리 넷은 「흐름 칸」 — 쉬운 말 제목 · 숫자 · 전주(또는 지난달 이맘때)와 견준 말 · 12주 막대(짙은 칸이 가장 최근 주)
 *   ② 본문 묶음은 이름 + 숫자만. 비율 칸에는 얇은 막대. 칸 설명은 「설명 보기」를 켜야 보인다
 *   ③ 칸마다 센 기간 · 읽는 법은 맨 아래에 접어 둔다
 * 견준 말의 규칙은 앱 지표 보고서(#335)와 같다 — 건수는 차이가 ±2√(두 값 합) 안이면 「비슷」, 비율은 1%p 미만이면 「비슷」.
 */

type Source = "backend" | "push" | "ga4" | "firebase";
type SourceStatus = "connected" | "app_fix" | "pending";
interface Metric { key: string; label: string; value: number | null; unit?: string; source: Source; period?: AppPeriodKey; note?: string; status?: SourceStatus }
interface Group { key: string; title: string; description: string; metrics: Metric[] }
interface Payload {
  groups: Group[];
  generated_at: string;
  backend_ok?: boolean;
  ga4_ok?: boolean;
  ga4_error?: string | null;
  ga4_through?: string | null;
  periods?: AppPeriod[];
  previous?: { users_redeemed?: { value: number; from: string; to: string } };
}
/** 12주 추이 — /api/probe/app/trend. 느려서(10~20초) KPI 를 먼저 그리고 나중에 얹는다 */
interface Trend { range: string; weeks: { start: string; end: string }[]; series: Record<string, (number | null)[]> }

const SOURCE_SHORT: Record<Source, string> = { backend: "DB", push: "푸시", ga4: "GA4", firebase: "Firebase" };

/**
 * 위 KPI 넷 — 1022 목업(기획팀 지표 구성 검토 1019): 머리가 전부 「앱을 켰다」에서 끝나서, 결과 지표(쿠폰 · 스탬프 쓴 사람)를 셋째 칸에 두고
 * DAU/WAU 는 WAU/MAU 로 바꿨다. 가입 1주 후 복귀는 기준 기기가 100대 안팎이라 매주 출렁여 본문(앱 이용)으로 내렸다.
 * 「쓴 사람」은 백엔드 월 집계(users_redeemed). 옛 백엔드면 값이 없어 「미확인」으로 둔다 — 값을 지어내지 않는다.
 */
const HEADLINE: { key: string; title: string; hint: string }[] = [
  { key: "wau", title: "앱을 켠 기기", hint: "최근 7일 · 주간 활성(WAU)" },
  { key: "open_to_store", title: "앱을 열어 매장까지 본 비율", hint: "최근 7일 · 세션 기준" },
  { key: "users_redeemed", title: "쿠폰 · 스탬프 쓴 사람", hint: "이번 달 · 계정 기준" },
  { key: "wau_mau", title: "한 달 안에 온 기기가 이번 주에도", hint: "WAU/MAU · 높을수록 단골이 쌓이는 중" },
];
/** 머리 칸으로 올라갔거나 · 대체되었거나 · 값이 없는 칸 — 본문 묶음에서 뺀다 */
const HIDE_IN_BODY = new Set(["users_redeemed", "wau", "open_to_store", "wau_mau", "dau_wau", "wau_per_signup", "invite_share", "coupon_code_share", "voucher_redeemed", "mileage_winners"]);
/** 이름만 바꾸는 칸 — 매장 지표 숫자와 범위가 다르다는 것을 이름에서 말한다 */
const RENAME: Record<string, string> = { coupon_used: "쿠폰 사용(앱 전체)" };
/**
 * 지난 기간과 견준 말 — 쓴 사람은 지난달 같은 날짜까지, 나머지는 끝난 주 둘(막대의 마지막 두 칸)을 견준다.
 * 건수는 flowOf(±2√합), 비율은 1%p 미만이면 비슷. 견줄 값이 없으면 null — 말을 달지 않는다.
 */
function compare(key: string, value: number | null, data: Payload | null, trend: Trend | null | false): { flow: Flow; text: string } | null {
  const sign = (d: number, u: string) => `${d > 0 ? "+" : ""}${d.toLocaleString()}${u}`;
  if (key === "users_redeemed") {
    const p = data?.previous?.users_redeemed;
    if (value === null || !p) return null;
    const flow = flowOf(value, p.value)!;
    return { flow, text: flow === "same" ? `지난달 이맘때와 비슷 (${sign(value - p.value, "명")})` : `지난달 이맘때보다 ${sign(value - p.value, "명")}` };
  }
  if (!trend) return null;
  const v = trend.series[key];
  if (!v || v.length < 2) return null;
  const a = v[v.length - 2], b = v[v.length - 1];
  if (a === null || b === null) return null;
  const d = Math.round((b - a) * 10) / 10;
  const count = key === "wau";
  const flow: Flow = count ? flowOf(b, a)! : Math.abs(d) < 1 ? "same" : d > 0 ? "up" : "down";
  const u = count ? "명" : "%p";
  return { flow, text: flow === "same" ? `전주와 비슷 (${sign(d, u)})` : `전주보다 ${sign(d, u)}` };
}
const FLOW_TONE: Record<Flow, string> = { up: "bg-indigo-50 text-indigo-700", same: "bg-black/[0.05] text-gray-600", down: "bg-amber-50 text-amber-800" };
const FLOW_MARK: Record<Flow, string> = { up: "▲ ", same: "", down: "▼ " };

/** 12주 막대 — 왼쪽이 12주 전, 오른쪽 끝 짙은 칸이 가장 최근에 끝난 주. 못 읽은 주(null)는 점선 칸으로 비운다(0 이 아니다) */
function WeekBars({ values, weeks, unit }: { values: (number | null)[]; weeks: { start: string; end: string }[]; unit: string }) {
  const nums = values.filter((x): x is number => x !== null);
  if (!nums.length) return <p className="text-[12px] text-gray-500 mt-3">12주 추이를 읽지 못했습니다.</p>;
  const H = 72, top = Math.max(...nums) || 1;
  const w = (i: number) => `${+weeks[i].start.slice(4, 6)}/${+weeks[i].start.slice(6, 8)} 주`;
  return (
    <div className="mt-3">
      <div className="flex items-end gap-1" style={{ height: H }} role="img" aria-label={`최근 ${values.length}주 · 최저 ${Math.min(...nums).toLocaleString()} · 최고 ${Math.max(...nums).toLocaleString()}${unit}`}>
        {values.map((n, i) => (
          <span key={i} className="flex-1 flex items-end h-full" title={n === null ? `${w(i)} · 미확인` : `${w(i)} · ${n.toLocaleString()}${unit}`}>
            {n === null
              ? <i className="block w-full h-full rounded-[3px] border border-dashed border-black/[0.12]" />
              : <i className="block w-full rounded-t-[3px]" style={{ height: Math.max(2, (n / top) * H), background: i === values.length - 1 ? BAR_NOW : BAR_PAST }} />}
          </span>
        ))}
      </div>
      <p className="flex justify-between text-[11px] text-gray-500 mt-1"><span>{w(0)}</span><span>{w(values.length - 1)}</span></p>
    </div>
  );
}

const GROUP_TABS: Record<string, string> = { usage: "앱 이용", funnel: "전환 퍼널", loyalty: "스탬프 · 마일리지", push: "푸시 · 배너" };

export default function AppMetrics() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  /** 못 읽은 것과 '아직 안 붙음' 은 다르다 (0925) */
  const [failed, setFailed] = useState(false);
  const [grp, setGrp] = useState<string>(() => takeParam("grp") ?? "usage");
  /** 「보고서 뽑기」 팝오버 — 기간 · 단위를 고르는 칸이 화면 필터처럼 보여 KPI 가 안 바뀌면 고장으로 오해했다(1022 목업) */
  const [pick, setPick] = useState(false);
  /** 칸 설명(센 방법 · 주의)은 켜야 보인다 — 늘 펼쳐 두면 숫자가 글에 묻힌다 */
  const [notes, setNotes] = useState(false);
  const pickRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!pick) return;
    const onDoc = (e: MouseEvent) => { if (!pickRef.current?.contains(e.target as Node)) setPick(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPick(false); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [pick]);

  const load = () => {
    setLoading(true);
    // 0925: 실패와 "아직 안 붙음" 을 구분한다. 전에는 둘 다 data=null 이라 화면이
    // "아직 어떤 출처도 연결되지 않았습니다" 와 0/0 을 띄웠다 — 못 읽은 것뿐인데.
    setFailed(false);
    fetch("/api/probe/app")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => { setData(null); setFailed(true); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const [trend, setTrend] = useState<Trend | null | false>(null);
  useEffect(() => {
    fetch("/api/probe/app/trend").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then(setTrend).catch(() => setTrend(false));
  }, []);

  const metric = (key: string) => data?.groups.flatMap((g) => g.metrics).find((m) => m.key === key);
  const period = (key?: AppPeriodKey) => (key ? data?.periods?.find((p) => p.key === key) : undefined);
  const groups = (data?.groups ?? []).map((g) => ({ ...g, title: GROUP_TABS[g.key] ?? g.title, metrics: g.metrics.filter((m) => !HIDE_IN_BODY.has(m.key)) }));
  const cur = groups.find((g) => g.key === grp) ?? groups[0];
  let lastSrc = "";

  return (
    <>
      <PageHeader
        title="앱 지표"
        description="학생이 앱을 켜고, 매장으로 가고, 다시 돌아오는지를 봅니다. 막대는 최근 12주이고 짙은 칸이 가장 최근 주입니다."
        actions={
          <>
            <Button icon={<IconRefresh />} onClick={load} disabled={loading}>다시 불러오기</Button>
            <span ref={pickRef} className="relative inline-flex">
              <Button icon={<IconChartBar />} onClick={() => setPick((v) => !v)} aria-haspopup="dialog" aria-expanded={pick}>보고서 뽑기</Button>
              {pick && (
                <div role="dialog" aria-label="보고서 뽑기" className="absolute right-0 top-full mt-2 z-40 w-[min(42rem,calc(100vw-2rem))] bg-white rounded-[18px] shadow-[0_8px_40px_-12px_rgba(16,24,40,0.3)] border border-black/[0.06] p-4">
                  <AppReportPicker embedded />
                </div>
              )}
            </span>
          </>
        }
      />

      {!loading && failed && (
        <div className="mb-4">
          <Notice tone="red" title="지금 읽지 못했습니다">
            앱 지표를 읽지 못했습니다. 출처가 없는 것이 아니라 확인하지 못한 것입니다 — 새로고침해 주세요.
          </Notice>
        </div>
      )}

      {/* 출처 하나만 못 읽은 경우 — 그 출처 칸만 '-' 다. 0 이 아니라 모름 */}
      {!loading && !failed && data && (data.backend_ok === false || data.ga4_ok === false) && (
        <div className="mb-4">
          <Notice tone="amber" title={`${[data.backend_ok === false && "백엔드 집계(DB · 푸시)", data.ga4_ok === false && "GA4(BigQuery)"].filter(Boolean).join(" · ")}을(를) 읽지 못했습니다`}>
            그 출처의 칸은 0 이 아니라 모름입니다.{data.ga4_error ? ` (BigQuery: ${data.ga4_error})` : ""}
          </Notice>
        </div>
      )}

      <div className="sat-stagger grid gap-4 sm:grid-cols-2 mb-5">
        {HEADLINE.map(({ key, title, hint }) => {
          const m = metric(key);
          const unread = !m || m.value === null;
          const c = compare(key, m?.value ?? null, data, trend);
          const series = trend ? trend.series[key] : null;
          return (
            <Card key={key}>
              <p className="text-[13px] font-semibold text-gray-900">{title}</p>
              <div className="flex flex-wrap items-end gap-x-2.5 gap-y-1 mt-2">
                <p className="text-[36px] leading-none font-bold tracking-[-0.03em] tabular-nums text-gray-900">
                  {loading ? "-" : unread ? "미확인" : m!.value!.toLocaleString()}{!loading && !unread && m!.unit && <span className="text-[14px] font-semibold text-gray-400 ml-1">{m!.unit}</span>}
                </p>
                {!loading && c && <span className={`inline-flex items-center h-6 px-2 rounded-md text-[12px] font-semibold mb-0.5 ${FLOW_TONE[c.flow]}`}>{FLOW_MARK[c.flow]}{c.text}</span>}
              </div>
              <p className="text-[12px] text-gray-500 mt-1.5 truncate">{hint}</p>
              {trend === null ? <div className="mt-3 rounded-lg bg-black/[0.03] animate-pulse" style={{ height: 90 }} />
                : !series ? <p className="text-[12px] text-gray-500 mt-3">12주 추이를 읽지 못했습니다 — 변화가 없다는 뜻이 아닙니다.</p>
                : <WeekBars values={series} weeks={trend ? trend.weeks : []} unit={key === "wau" || key === "users_redeemed" ? "명" : "%"} />}
            </Card>
          );
        })}
      </div>

      {loading ? (
        <Card flush><Skeleton rows={6} cols={4} /></Card>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <FilterPills soft label="지표 묶음" value={cur?.key ?? "usage"} onChange={setGrp} options={groups.map((g) => ({ key: g.key, label: g.title, count: g.metrics.length }))} />
            <label className="inline-flex items-center gap-1.5 text-[12.5px] text-gray-600 cursor-pointer select-none">
              <input type="checkbox" className="accent-[#4F46E5]" checked={notes} onChange={(e) => setNotes(e.target.checked)} /> 설명 보기
            </label>
          </div>
          {cur && (
            <Card>
              <p className="text-[12px] text-gray-600 mb-1">{cur.description}</p>
              <dl className="divide-y divide-black/[0.06]">
                {cur.metrics.map((m) => {
                  // 출처 · 기간 칩은 앞 칸과 같으면 한 번만 — 같은 칩 열 개가 줄지어 서면 아무것도 말하지 않는다
                  const src = `${SOURCE_SHORT[m.source]}${m.period ? ` · ${PERIOD_LABEL[m.period]}` : ""}`;
                  const show = src !== lastSrc;
                  lastSrc = src;
                  return (
                    <div key={m.key} className={`flex items-center gap-3 ${notes ? "py-3" : "py-2"}`}>
                      <dt className="flex-1 min-w-0">
                        <span className="block text-[13px] text-gray-800">{RENAME[m.key] ?? m.label}</span>
                        {notes && m.note && <span className="block text-[12px] text-gray-600 mt-1 leading-relaxed">{m.note}</span>}
                      </dt>
                      {/* 비율 칸은 얇은 막대로 — 0~100% 어디쯤인지 숫자를 읽기 전에 보인다 */}
                      {m.unit === "%" && m.value !== null && m.value >= 0 && m.value <= 100 && (
                        <span className="hidden sm:block w-24 h-1.5 rounded-full bg-black/[0.05] overflow-hidden shrink-0" aria-hidden><span className="block h-full rounded-full bg-[#4F46E5]" style={{ width: `${m.value}%` }} /></span>
                      )}
                      <dd className="shrink-0 flex items-center justify-end gap-2 min-w-[7.5rem]">
                        <span className="flex flex-wrap justify-end gap-1" title={period(m.period)?.range ?? undefined}>
                          {m.status === "app_fix" && <TagChip>앱 수정 대기</TagChip>}
                          {show && <TagChip>{src}</TagChip>}
                        </span>
                        <span className="text-right text-[15px] font-semibold tabular-nums text-gray-900">
                          {m.value === null ? <Unknown /> : <>{m.value.toLocaleString()}{m.unit && <span className="text-[12px] font-medium text-gray-500 ml-1">{m.unit}</span>}</>}
                        </span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </Card>
          )}
        </>
      )}

      <Fold label="숫자 읽는 법 · 칸마다 센 기간">
        <p className="text-[12px] text-gray-600 leading-relaxed">
          머리 칸의 숫자는 지금 값(최근 7일 · 이번 달)이고, 막대는 지난 일요일까지 끝난 12주입니다 — 「주요 지표 보고서」와 같은 계산을 6시간마다 캐시해 그립니다(처음엔 10~20초).
          견준 말은 끝난 주 둘을 견준 것이라 숫자와 며칠 어긋날 수 있습니다. 「쓴 사람」 막대는 주마다 센 계정이라 위 이번 달 값과 단위가 다르고, 견준 말은 지난달 같은 날짜까지와 견줍니다.
          차이가 크지 않으면(건수 ±2√합 · 비율 1%p 미만) 「비슷」으로 봅니다. 「미확인」은 0 이 아니라 읽지 못한 값입니다.
        </p>
        <p className="text-[12px] text-gray-600 mt-1 leading-relaxed">
          GA4 · Firebase 칸은 기기 단위라 재설치하면 새 사용자로 셉니다 — 계정 수와 1:1 이 아닙니다. 친구 초대 공유는 앱 릴리스 뒤에 다시 보입니다. 마일리지 식사권 사용 · 당첨 · 교환은 「마일리지 추첨」에서 봅니다.
        </p>
        {!loading && data?.periods && <PeriodStrip periods={data.periods} through={data.ga4_through ?? null} />}
      </Fold>
    </>
  );
}

/**
 * 기간 줄 — 칩의 기간 이름 → 실제로 센 날짜. 출처마다 한 줄이다. 본문 아래로 내렸다(1022 목업) — 숫자를 본 뒤 「언제 것인가」를 찾아보는 자리.
 * DB 는 읽을 때마다 오늘까지 세고, GA4 는 확정 테이블의 마지막 날(보통 어제)에서 거꾸로 잡는다 — 두 줄의 끝 날짜가 다른 까닭.
 */
function PeriodStrip({ periods, through }: { periods: AppPeriod[]; through: string | null }) {
  const lines: { group: AppPeriod["group"]; title: string; sub: string }[] = [
    { group: "db", title: "DB · 푸시", sub: "읽을 때마다 새로 셉니다" },
    { group: "ga4", title: "GA4 · Firebase", sub: through ? `확정 테이블 ${+through.slice(5, 7)}/${+through.slice(8, 10)}까지 · 6시간마다 다시 읽습니다` : "BigQuery 를 읽지 못했습니다" },
  ];
  return (
    <section className="mt-3" aria-label="칸마다 센 기간">
      <p className="text-[12.5px] font-medium text-gray-700 mb-2">칸마다 센 기간</p>
      <dl className="space-y-2.5">
        {lines.map((l) => (
          <div key={l.group} className="flex flex-col lg:flex-row lg:items-start gap-x-4 gap-y-1.5">
            <dt className="lg:w-44 shrink-0">
              <span className="block text-[12px] font-semibold text-gray-700">{l.title}</span>
              <span className="block text-[12px] text-gray-600">{l.sub}</span>
            </dt>
            <dd className="flex flex-wrap gap-x-4 gap-y-1.5">
              {periods.filter((p) => p.group === l.group).map((p) => (
                <span key={p.key} className="inline-flex items-center gap-1.5 text-[12px]" title={p.note}>
                  <TagChip>{p.label}</TagChip>
                  {p.range ? <span className="tabular-nums text-gray-800 font-medium">{p.range}</span> : <Unknown />}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
