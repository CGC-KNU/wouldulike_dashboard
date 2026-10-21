"use client";

import { useEffect, useRef, useState } from "react";
import { IconChartBar, IconRefresh } from "@tabler/icons-react";
import { Button, Card, Chip, FilterPills, Kpi, Notice, PageHeader, Skeleton, surface } from "../_shared/ui";
import { TagChip, Unknown, takeParam } from "./kit";
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
}

const SOURCE_SHORT: Record<Source, string> = { backend: "DB", push: "푸시", ga4: "GA4", firebase: "Firebase" };

/**
 * 위 KPI 넷 — 1022 목업(기획팀 지표 구성 검토 1019): 머리가 전부 「앱을 켰다」에서 끝나서, 결과 지표(쿠폰 · 스탬프 쓴 사람)를 셋째 칸에 두고
 * DAU/WAU 는 WAU/MAU 로 바꿨다. 가입 1주 후 복귀는 기준 기기가 100대 안팎이라 매주 출렁여 본문(앱 이용)으로 내렸다.
 * 「쓴 사람」은 백엔드 집계가 아직 없다(개발 중) — 값을 지어내지 않고 「미확인」으로 둔다.
 */
const HEADLINE: { key: string; hint: string }[] = [
  { key: "wau", hint: "앱을 켠 기기" },
  { key: "open_to_store", hint: "세션 기준" },
  { key: "users_redeemed", hint: "계정 · 개발 중" },
  { key: "wau_mau", hint: "30일 안에 온 기기가 이번 주에도" },
];
/** 머리 칸으로 올라갔거나 · 대체되었거나 · 값이 없는 칸 — 본문 묶음에서 뺀다 */
const HIDE_IN_BODY = new Set(["wau", "open_to_store", "wau_mau", "dau_wau", "wau_per_signup", "invite_share", "coupon_code_share", "voucher_redeemed", "mileage_winners"]);
/** 이름만 바꾸는 칸 — 매장 지표 숫자와 범위가 다르다는 것을 이름에서 말한다 */
const RENAME: Record<string, string> = { coupon_used: "쿠폰 사용(앱 전체)" };
const GROUP_TABS: Record<string, string> = { usage: "앱 이용", funnel: "전환 퍼널", loyalty: "스탬프 · 마일리지", push: "푸시 · 배너" };

export default function AppMetrics() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  /** 못 읽은 것과 '아직 안 붙음' 은 다르다 (0925) */
  const [failed, setFailed] = useState(false);
  const [grp, setGrp] = useState<string>(() => takeParam("grp") ?? "usage");
  /** 「보고서 뽑기」 팝오버 — 기간 · 단위를 고르는 칸이 화면 필터처럼 보여 KPI 가 안 바뀌면 고장으로 오해했다(1022 목업) */
  const [pick, setPick] = useState(false);
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

  const metric = (key: string) => data?.groups.flatMap((g) => g.metrics).find((m) => m.key === key);
  const period = (key?: AppPeriodKey) => (key ? data?.periods?.find((p) => p.key === key) : undefined);
  const groups = (data?.groups ?? []).map((g) => ({ ...g, title: GROUP_TABS[g.key] ?? g.title, metrics: g.metrics.filter((m) => !HIDE_IN_BODY.has(m.key)) }));
  const cur = groups.find((g) => g.key === grp) ?? groups[0];
  let lastSrc = "";

  return (
    <>
      <PageHeader
        title="앱 지표"
        description="학생이 앱을 켜고, 매장으로 가고, 다시 돌아오는지를 봅니다. 「미확인」은 0 이 아니라 읽지 못한 값입니다."
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

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-2">
        {HEADLINE.map(({ key, hint }) => {
          const m = metric(key);
          const range = period(m?.period)?.range;
          const unread = key === "users_redeemed" || !m || m.value === null;
          return <Kpi key={key} label={key === "users_redeemed" ? "쿠폰 · 스탬프 쓴 사람" : m?.label ?? key} value={loading ? "-" : unread ? "미확인" : m!.value!.toLocaleString()} suffix={!unread ? m!.unit : undefined} hint={range ? `${range} · ${hint}` : hint} />;
        })}
      </div>
      <p className="text-[12px] text-gray-600 mb-4">지난 기간 대비와 12주 추이 그래프는 <Chip tone="gray">추이 · 개발 중</Chip> — 「주요 지표 보고서」(보고서 뽑기)에서 같은 칸의 추이를 봅니다.</p>

      {loading ? (
        <Card flush><Skeleton rows={6} cols={4} /></Card>
      ) : (
        <>
          <div className="mb-4">
            <FilterPills soft label="지표 묶음" value={cur?.key ?? "usage"} onChange={setGrp} options={groups.map((g) => ({ key: g.key, label: g.title, count: g.metrics.length }))} />
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
                    <div key={m.key} className="flex items-start gap-3 py-3">
                      <dt className="flex-1 min-w-0">
                        <span className="block text-[13px] text-gray-800">{RENAME[m.key] ?? m.label}</span>
                        {m.note && <span className="block text-[12px] text-gray-600 mt-1 leading-relaxed">{m.note}</span>}
                      </dt>
                      <dd className="shrink-0 flex flex-col items-end gap-1">
                        <span className="text-right text-[15px] font-semibold tabular-nums text-gray-900">
                          {m.value === null ? <Unknown /> : <>{m.value.toLocaleString()}{m.unit && <span className="text-[12px] font-medium text-gray-500 ml-1">{m.unit}</span>}</>}
                        </span>
                        <span className="flex flex-wrap justify-end gap-1" title={period(m.period)?.range ?? undefined}>
                          {m.status === "app_fix" && <TagChip>앱 수정 대기</TagChip>}
                          {show && <TagChip>{src}</TagChip>}
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

      {!loading && data?.periods && <PeriodStrip periods={data.periods} through={data.ga4_through ?? null} />}

      <p className="text-[12px] text-gray-600 mt-3 leading-relaxed">
        GA4 · Firebase 칸은 기기 단위라 재설치하면 새 사용자로 셉니다 — 계정 수와 1:1 이 아닙니다. 친구 초대 공유는 앱 릴리스 뒤에 다시 보입니다. 마일리지 식사권 사용 · 당첨 · 교환은 「마일리지 추첨」에서 봅니다.
      </p>
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
    <section className={`${surface} px-4 py-3 mt-4`} aria-label="칸마다 센 기간">
      <p className="text-[15px] font-semibold text-gray-900 mb-3">칸마다 센 기간</p>
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
