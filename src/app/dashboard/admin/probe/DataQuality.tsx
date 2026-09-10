"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconCopy, IconRefresh, IconArrowRight } from "@tabler/icons-react";
import type { QualityIssue, QualitySeverity } from "@/lib/draft/types";
import { Button, Card, Chip, DraftBadge, Empty, Kpi, Notice, PageHeader, Skeleton, type ChipTone } from "../_shared/ui";

/**
 * Probe · 데이터 정합성 점검.
 *
 * 이 화면 하나가 Probe 를 만들 이유다. 최근 사고가 전부 같은 모양이었다. **데이터 두 곳이 어긋났는데 사람이 우연히 볼 때까지 아무도 몰랐다.**
 *   · 09-05 "지금 제휴 아닌 하카타파스타가 튜토리얼에 뜬다"
 *   · 09-10 "첫 가입 화면 쿠폰이 실제 쿠폰과 다르다"
 *
 * 규칙으로 박아두면 화면이 먼저 말한다. 각 항목엔 어느 데이터를 비교했는지(source)와 어디서 고치는지(hint)가 붙는다.
 * Pitchr 에이전트 액션의 "제안 → 승인/거부" 카드 문법을 빌렸다. 여기서는 "고치러 가기" 가 승인이다.
 */

const SEV_LABEL: Record<QualitySeverity, string> = { high: "높음", medium: "보통", low: "낮음" };
const SEV_TONE: Record<QualitySeverity, ChipTone> = { high: "red", medium: "amber", low: "gray" };

/** 규칙별 "어디서 고치나" 딥링크. 화면이 문제만 말하고 끝나면 "그래서 뭐?" 가 된다. */
const FIX_TAB: Record<string, { tab: string; label: string }> = {
  TIER_MISSING: { tab: "restaurants", label: "식당 관리에서 플랜 지정" },
  PAID_NO_BENEFIT: { tab: "restaurants", label: "식당 관리에서 혜택 등록" },
  INACTIVE_STILL_EXPOSED: { tab: "content", label: "배너 & 팝업에서 내리기" },
  INACTIVE_HAS_BENEFIT: { tab: "restaurants", label: "식당 관리에서 혜택 끄기" },
  OPS_ROW_MISSING: { tab: "astro-ops", label: "매장 현황에서 기록" },
  PAID_TIER_UNSETTLED: { tab: "astro-billing", label: "입금 현황에서 처리" },
  PAID_NO_KIT: { tab: "astro-ops", label: "매장 현황에서 체크" },
  SEASON_UNSET: { tab: "astro-ops", label: "매장 현황에서 설정" },
  LEAD_STALE: { tab: "astro-leads", label: "입점 후보에서 연락" },
};

interface Payload {
  issues: QualityIssue[];
  counts: Record<QualitySeverity, number>;
  checked: { restaurants: number; benefits: number; featured: number; leads: number };
  backend_reachable: boolean;
  generated_at: string;
  draft?: boolean;
  draft_note?: string;
}

export default function DataQuality({ onGo }: { onGo?: (tab: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sev, setSev] = useState<QualitySeverity | "all">("all");
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/probe/quality")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const issues = useMemo(() => (data?.issues ?? []).filter((i) => sev === "all" || i.severity === sev), [data, sev]);

  /** 규칙 + 심각도로 묶는다. 같은 규칙에 20곳이 걸리면 20줄보다 1묶음이 낫다. */
  const groups = useMemo(() => {
    const m = new Map<string, QualityIssue[]>();
    for (const i of issues) {
      const k = `${i.rule}:${i.severity}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    }
    const order = { high: 0, medium: 1, low: 2 } as const;
    return [...m.values()].sort((a, b) => order[a[0].severity] - order[b[0].severity] || b.length - a.length);
  }, [issues]);

  async function copyAll() {
    if (!data) return;
    const today = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(new Date());
    const text = [
      `[데이터 정합성 ${today}] 높음 ${data.counts.high} · 보통 ${data.counts.medium} · 낮음 ${data.counts.low}`,
      ...data.issues.map((i) => `- [${SEV_LABEL[i.severity]}] ${i.subject}: ${i.title}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 무시 */
    }
  }

  return (
    <>
      <PageHeader
        title="데이터 정합성 점검"
        description="매장·혜택·기획전·입금 기록을 서로 비교해 어긋난 곳을 찾습니다. 각 항목에 비교한 데이터와 고치는 자리가 같이 있습니다."
        actions={
          <>
            {data?.draft && <DraftBadge note={data.draft_note} />}
            <Button icon={<IconCopy />} onClick={copyAll} aria-live="polite" disabled={!data}>
              {copied ? "복사했습니다" : "슬랙용 복사"}
            </Button>
            <Button variant="primary" icon={<IconRefresh />} onClick={load} disabled={loading}>
              다시 점검
            </Button>
          </>
        }
      />

      {/* 백엔드를 못 읽으면 규칙 대부분이 침묵한다. '이상 없음'과 반드시 구별한다. */}
      {data && !data.backend_reachable && (
        <div className="mb-4">
          <Notice tone="red" title="백엔드를 읽지 못했습니다">
            매장·혜택·기획전을 비교하는 규칙이 전부 침묵합니다. 아래가 비어 있어도 <strong>이상 없음이 아닙니다.</strong>
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <Kpi label="높음" value={loading ? "-" : data?.counts.high ?? 0} tone="alert" hint="사용자에게 이미 보이는 문제" onClick={() => setSev(sev === "high" ? "all" : "high")} active={sev === "high"} />
        <Kpi label="보통" value={loading ? "-" : data?.counts.medium ?? 0} hint="곧 문제가 됨" onClick={() => setSev(sev === "medium" ? "all" : "medium")} active={sev === "medium"} />
        <Kpi label="낮음" value={loading ? "-" : data?.counts.low ?? 0} hint="비어 있는 칸" onClick={() => setSev(sev === "low" ? "all" : "low")} active={sev === "low"} />
        <Kpi label="점검 범위" value={loading ? "-" : data?.checked.restaurants ?? 0} suffix="매장" hint={data ? `혜택 ${data.checked.benefits} · 기획전 ${data.checked.featured} · 후보 ${data.checked.leads}` : undefined} />
      </div>

      {loading ? (
        <Card flush><Skeleton rows={5} cols={3} /></Card>
      ) : groups.length === 0 ? (
        <Card>
          <Empty
            title={data?.backend_reachable ? "어긋난 데이터가 없습니다" : "판정할 수 없습니다"}
            detail={data?.backend_reachable ? "지금 규칙 기준으로는 깨끗합니다. 규칙은 늘려 가면 됩니다." : "백엔드 연결을 먼저 확인하세요."}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((list) => {
            const head = list[0];
            const fix = FIX_TAB[head.rule];
            return (
              <Card key={`${head.rule}:${head.severity}`} className={head.severity === "high" ? "border-red-200" : ""}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Chip tone={SEV_TONE[head.severity]} dot={head.severity === "high"}>{SEV_LABEL[head.severity]}</Chip>
                      <h3 className="text-[14px] font-semibold text-gray-900">{head.title}</h3>
                      <span className="text-[12px] text-gray-400 tabular-nums">{list.length}곳</span>
                    </div>
                    <p className="text-[13px] text-gray-600 mt-1.5 leading-relaxed">{head.detail}</p>
                  </div>
                  {fix && onGo && (
                    <Button size="sm" variant="primary" icon={<IconArrowRight />} onClick={() => onGo(fix.tab)}>
                      {fix.label}
                    </Button>
                  )}
                </div>

                <ul className="flex flex-wrap gap-1.5 mt-3">
                  {list.map((i) => (
                    <li key={i.id} className="text-[12px] font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                      {i.subject}
                    </li>
                  ))}
                </ul>

                <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-gray-500">
                  <span>고치는 법: <span className="text-gray-700">{head.hint}</span></span>
                  <span>비교: <code className="bg-gray-100 px-1 rounded text-[11px]">{head.source}</code></span>
                  <span className="text-gray-400">규칙 {head.rule}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-[12px] text-gray-500 mt-4 leading-relaxed">
        다음 단계: 이 점검을 매일 아침 돌려 <span className="font-semibold text-gray-700">높음</span>이 새로 생겼을 때만 슬랙에 올립니다. 매일 다 올리면 아무도 안 봅니다.
      </p>
    </>
  );
}
