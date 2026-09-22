"use client";

import { useEffect, useState } from "react";
import { IconExternalLink, IconFileDescription, IconRefresh } from "@tabler/icons-react";
import { Button, Card, Chip, DraftBadge, Kpi, Notice, PageHeader, Skeleton, Table, Td, Th, type ChipTone } from "../_shared/ui";

/**
 * Probe · 앱 지표.
 *
 * 매장 지표(쿠폰·스탬프)는 매장 쪽 절반이다. 나머지 절반, "학생이 앱을 켜고 돌아오는가"는 여기다.
 * 지금 채워진 칸은 백엔드가 이미 갖고 있는 것뿐이고, 빈 칸은 **출처가 연결되면 채워질 자리**다.
 * 지어낸 숫자로 채우지 않는다. 대신 각 칸에 어디서 오는지(출처 칩)를 붙여, 다음에 무엇을 연결해야
 * 어떤 칸이 살아나는지 한눈에 보이게 했다.
 */

type Source = "backend" | "push" | "ga4" | "firebase";
type SourceStatus = "connected" | "app_fix" | "pending";
interface Metric { key: string; label: string; value: number | null; unit?: string; source: Source; note?: string; status?: SourceStatus }
interface Group { key: string; title: string; description: string; metrics: Metric[] }
interface Payload {
  groups: Group[];
  sources: { key: Source; label: string; connected: boolean; status?: SourceStatus; hint: string }[];
  generated_at: string;
  draft?: boolean;
  draft_note?: string;
}

const SOURCE_TONE: Record<Source, ChipTone> = { backend: "navy", push: "blue", ga4: "amber", firebase: "amber" };
const SOURCE_SHORT: Record<Source, string> = { backend: "DB", push: "푸시", ga4: "GA4", firebase: "Firebase" };

/** 출처 상태 칩 — 연결됨 · 앱 수정 대기 · 연결 전. 홈 사이드 카드도 같이 쓴다. status 가 없는 옛 응답은 connected 로 판단. */
export function SourceStatusChip({ s }: { s: { connected: boolean; status?: SourceStatus } }) {
  const st = s.status ?? (s.connected ? "connected" : "pending");
  if (st === "connected") return <Chip tone="green" dot>연결됨</Chip>;
  if (st === "app_fix") return <Chip tone="amber">앱 수정 대기</Chip>;
  return <Chip tone="gray">연결 전</Chip>;
}

export default function AppMetrics() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch("/api/probe/app")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const connected = data?.sources.filter((s) => s.connected).length ?? 0;
  const filled = data?.groups.flatMap((g) => g.metrics).filter((m) => m.value !== null).length ?? 0;
  const total = data?.groups.flatMap((g) => g.metrics).length ?? 0;

  return (
    <>
      <PageHeader
        title="앱 지표"
        description="학생이 앱을 켜고, 매장으로 가고, 다시 돌아오는지를 봅니다. 빈 칸은 0 이 아니라 아직 연결되지 않은 출처입니다."
        actions={
          <>
            {data?.draft && <DraftBadge note={data.draft_note} />}
            {/* 보고서는 서버가 그 자리에서 만든다(스냅샷 없음) — 양식에 끼워 파일 한 장으로 나온다. 위 띠에서 PNG·HTML·인쇄. */}
            <a href="/r/app" target="_blank" rel="noreferrer" title="마지막으로 다 끝난 주(월~일)의 주간 보고서를 새 탭에서 엽니다">
              <Button variant="primary" icon={<IconFileDescription />}>주간 보고서 만들기</Button>
            </a>
            <Button icon={<IconRefresh />} onClick={load} disabled={loading}>다시 불러오기</Button>
          </>
        }
      />

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <Kpi label="채워진 지표" value={loading ? "-" : `${filled} / ${total}`} hint="출처가 연결된 칸" />
        <Kpi label="연결된 출처" value={loading ? "-" : `${connected} / ${data?.sources.length ?? 4}`} hint="DB · 푸시 · GA4 · Firebase" />
        {!data?.sources.find((s) => s.key === "ga4")?.connected
          ? <Kpi label="다음 연결" value={loading ? "-" : "BigQuery"} hint="GA4 원본 쿼리로 4칸 · 2칸은 앱 수정 대기" />
          : !data?.sources.find((s) => s.key === "backend")?.connected
            ? <Kpi label="다음 연결" value={loading ? "-" : "DB 집계"} hint="백엔드 app-stats 배포로 9칸 · 2칸은 앱 수정 대기" />
            : <Kpi label="남은 칸" value={loading ? "-" : "정의 · 앱 수정"} hint="매장 상세 → 쿠폰은 정의 보류 · 배너 노출은 앱 이벤트 먼저" />}
        <Kpi label="주요 지표 후보" value={loading ? "-" : "발급 → 사용"} hint="배너 A/B 의 판정 기준 (Castor)" />
      </div>

      {!loading && connected === 0 && (
        <div className="mb-4">
          <Notice tone="amber" title="아직 어떤 출처도 연결되지 않았습니다">
            아래 표는 지표의 자리와 출처를 먼저 못 박은 것입니다. 백엔드 집계 엔드포인트 하나만 붙어도 DB 칸이 채워집니다.
          </Notice>
        </div>
      )}

      {loading ? (
        <Card flush><Skeleton rows={6} cols={4} /></Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {data?.groups.map((g) => (
            <Card key={g.key} title={g.title} description={g.description}>
              <dl className="divide-y divide-gray-100">
                {g.metrics.map((m) => (
                  <div key={m.key} className="flex items-center gap-3 py-2.5">
                    <dt className="flex-1 min-w-0">
                      <span className="block text-[13px] text-gray-800">{m.label}</span>
                      {m.note && <span className="block text-[12px] text-gray-500 mt-0.5">{m.note}</span>}
                    </dt>
                    {m.status === "app_fix" && <Chip tone="amber">앱 수정 대기</Chip>}
                    <Chip tone={SOURCE_TONE[m.source]}>{SOURCE_SHORT[m.source]}</Chip>
                    <dd className={`w-24 text-right text-[16px] font-bold tabular-nums ${m.value === null ? "text-gray-300" : "text-gray-900"}`}>
                      {m.value === null ? "-" : m.value.toLocaleString()}
                      {m.value !== null && m.unit && <span className="text-[12px] font-medium text-gray-400 ml-1">{m.unit}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>
      )}

      {data && (
        <Card flush title="데이터 출처" description="무엇을 연결하면 어떤 칸이 살아나는지." className="mt-4">
          <Table minWidth="36rem">
            <thead>
              <tr>
                <Th width="9rem">출처</Th>
                <Th width="6rem">상태</Th>
                <Th>연결 방법</Th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((s) => (
                <tr key={s.key}>
                  <Td><span className="font-semibold text-gray-900">{s.label}</span></Td>
                  <Td><SourceStatusChip s={s} /></Td>
                  <Td className="text-gray-600">{s.hint}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <p className="text-[12px] text-gray-500 mt-3 leading-relaxed">
        GA4 는 3월부터 앱 이벤트를 받고 있고 BigQuery(<code className="bg-gray-100 px-1 rounded">wouldulike-efe19.analytics_494806625</code>)에 쌓입니다.
        칸을 채울 때 화면 이벤트 이름은 Castor 의 화면 ID(<code className="bg-gray-100 px-1 rounded">dashboard.admin</code> 식)와 맞춥니다.
        그래야 Castor 가 만든 실험을 Probe 가 같은 이름으로 읽습니다.
        <a href="https://support.google.com/analytics/answer/9304153" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 ml-2 text-navy font-medium">
          GA4 앱 설정 <IconExternalLink size={12} aria-hidden="true" />
        </a>
      </p>
    </>
  );
}
