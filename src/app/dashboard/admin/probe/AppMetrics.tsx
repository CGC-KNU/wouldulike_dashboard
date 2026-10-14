"use client";

import { useEffect, useState } from "react";
import { IconFileDescription, IconRefresh } from "@tabler/icons-react";
import { Button, Card, Chip, Kpi, Notice, PageHeader, Skeleton, surface, type ChipTone } from "../_shared/ui";
import { PERIOD_LABEL, type AppPeriod, type AppPeriodKey } from "@/lib/draft/appPeriods";

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

/**
 * 위 KPI — 주간 보고서 머리 지표와 같은 넷(appReportData `headline`). 값·단위는 아래 칸에서 그대로 가져온다.
 * 힌트 앞에 그 칸의 구간을 붙인다 — 넷 중 복귀만 7일 창이 아니라 첫 실행 코호트다. 힌트는 한 줄(잘림)이라 짧게.
 */
const HEADLINE: { key: string; hint: string }[] = [
  { key: "wau", hint: "앱을 켠 기기" },
  { key: "open_to_store", hint: "세션 기준" },
  { key: "retention_w1", hint: "7~13일째" },
  { key: "dau_wau", hint: "20% 넘으면 습관" },
];

const SOURCE_TONE: Record<Source, ChipTone> = { backend: "navy", push: "blue", ga4: "amber", firebase: "amber" };
const SOURCE_SHORT: Record<Source, string> = { backend: "DB", push: "푸시", ga4: "GA4", firebase: "Firebase" };

export default function AppMetrics() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  /** 못 읽은 것과 '아직 안 붙음' 은 다르다 (0925) */
  const [failed, setFailed] = useState(false);

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

  return (
    <>
      <PageHeader
        title="앱 지표"
        description="학생이 앱을 켜고, 매장으로 가고, 다시 돌아오는지를 봅니다. 빈 칸은 0 이 아니라 읽지 못한 값입니다."
        actions={
          <>
            {/* 보고서는 서버가 그 자리에서 만든다(스냅샷 없음) — 양식에 끼워 파일 한 장으로 나온다. 위 띠에서 PNG·HTML·인쇄. */}
            <a href="/r/app" target="_blank" rel="noreferrer" title="마지막으로 다 끝난 주(월~일)의 주간 보고서를 새 탭에서 엽니다">
              <Button variant="primary" icon={<IconFileDescription />}>주간 보고서</Button>
            </a>
            {/* 월간은 DB 칸을 백엔드 월별 스냅샷에서 읽어 전월 대비를 붙인다. 스냅샷이 없는 달은 그 칸이 빈다(0 아님). */}
            <a href="/r/app?type=monthly" target="_blank" rel="noreferrer" title="마지막으로 다 끝난 달의 월간 보고서를 새 탭에서 엽니다 — DB 칸에 전월 대비가 붙습니다">
              <Button icon={<IconFileDescription />}>월간 보고서</Button>
            </a>
            <Button icon={<IconRefresh />} onClick={load} disabled={loading}>다시 불러오기</Button>
          </>
        }
      />

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        {HEADLINE.map(({ key, hint }) => {
          const m = metric(key);
          const range = period(m?.period)?.range;
          return <Kpi key={key} label={m?.label ?? key} value={loading || !m || m.value === null ? "-" : m.value.toLocaleString()} suffix={m?.value != null ? m.unit : undefined} hint={range ? `${range} · ${hint}` : hint} />;
        })}
      </div>

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

      {!loading && data?.periods && <PeriodStrip periods={data.periods} through={data.ga4_through ?? null} />}

      {loading ? (
        <Card flush><Skeleton rows={6} cols={4} /></Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {data?.groups.map((g) => (
            <Card key={g.key} title={g.title} description={g.description}>
              <dl className="divide-y divide-gray-100">
                {g.metrics.map((m) => (
                  <div key={m.key} className="flex items-start gap-3 py-2.5">
                    <dt className="flex-1 min-w-0">
                      <span className="block text-[13px] text-gray-800">{m.label}</span>
                      {m.note && <span className="block text-[12px] text-gray-500 mt-0.5">{m.note}</span>}
                    </dt>
                    {/* 숫자 바로 밑에 「출처 · 기간」 — 이 숫자가 어디서, 언제 것인지. 날짜는 위 기간 줄에 */}
                    <dd className="shrink-0 flex flex-col items-end gap-1">
                      <span className={`text-right text-[16px] font-bold tabular-nums ${m.value === null ? "text-gray-300" : "text-gray-900"}`}>
                        {m.value === null ? "-" : m.value.toLocaleString()}
                        {m.value !== null && m.unit && <span className="text-[12px] font-medium text-gray-400 ml-1">{m.unit}</span>}
                      </span>
                      <span className="flex flex-wrap justify-end gap-1" title={period(m.period)?.range ?? undefined}>
                        {m.status === "app_fix" && <Chip tone="amber">앱 수정 대기</Chip>}
                        <Chip tone={SOURCE_TONE[m.source]}>{SOURCE_SHORT[m.source]}{m.period && ` · ${PERIOD_LABEL[m.period]}`}</Chip>
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>
      )}

      <p className="text-[12px] text-gray-500 mt-3 leading-relaxed">
        GA4 · Firebase 칸은 기기 단위라 재설치하면 새 사용자로 셉니다 — 계정 수와 1:1 이 아닙니다.
      </p>
    </>
  );
}

/**
 * 기간 줄 — 칩의 기간 이름 → 실제로 센 날짜. 출처마다 한 줄이다.
 * DB 는 읽을 때마다 오늘까지 세고, GA4 는 확정 테이블의 마지막 날(보통 어제)에서 거꾸로 잡는다 — 두 줄의 끝 날짜가 다른 까닭.
 */
function PeriodStrip({ periods, through }: { periods: AppPeriod[]; through: string | null }) {
  const lines: { group: AppPeriod["group"]; title: string; sub: string; tone: ChipTone }[] = [
    { group: "db", title: "DB · 푸시", sub: "읽을 때마다 새로 셉니다", tone: "navy" },
    { group: "ga4", title: "GA4 · Firebase", sub: through ? `확정 테이블 ${+through.slice(5, 7)}/${+through.slice(8, 10)}까지 · 6시간마다 다시 읽습니다` : "BigQuery 를 읽지 못했습니다", tone: "amber" },
  ];
  return (
    <section className={`${surface} px-4 py-3 mb-4`} aria-label="칸마다 센 기간">
      <dl className="space-y-2.5">
        {lines.map((l) => (
          <div key={l.group} className="flex flex-col lg:flex-row lg:items-start gap-x-4 gap-y-1.5">
            <dt className="lg:w-44 shrink-0">
              <span className="block text-[12px] font-semibold text-gray-700">{l.title}</span>
              <span className="block text-[11px] text-gray-500">{l.sub}</span>
            </dt>
            <dd className="flex flex-wrap gap-x-4 gap-y-1.5">
              {periods.filter((p) => p.group === l.group).map((p) => (
                <span key={p.key} className="inline-flex items-center gap-1.5 text-[12px]" title={p.note}>
                  <Chip tone={l.tone}>{p.label}</Chip>
                  <span className={`tabular-nums ${p.range ? "text-gray-800 font-medium" : "text-gray-300"}`}>{p.range ?? "-"}</span>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
