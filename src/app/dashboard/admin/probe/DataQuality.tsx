"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { QualityIssue, QualitySeverity } from "@/lib/draft/types";
import { Card, Chip, DraftBadge, Empty, Kpi, Spinner } from "../_shared/ui";

/**
 * Probe · 데이터 정합성 점검.
 *
 * 이 화면 하나가 Probe 를 만들 이유다. 최근에 실제로 난 사고를 보면 전부 같은 모양이다 —
 * **데이터 두 곳이 어긋났는데 사람이 우연히 볼 때까지 아무도 몰랐다.**
 *
 *   · 09-05 "지금 제휴 아닌 하카타파스타가 튜토리얼에 뜬다"
 *   · 09-10 "첫 가입 화면 쿠폰이 실제 쿠폰과 다르다"
 *   · 09-05 "이런 기본적인 걸 아무도 언급 안 했다는 게 더 문제"
 *
 * 규칙으로 박아두면 화면이 먼저 말한다. 그래서 각 항목에 **어느 데이터를 비교했는지(source)**
 * 와 **어디서 고치는지(hint)** 를 반드시 같이 붙였다. 둘 중 하나라도 없으면 "그래서 뭐?" 가 된다.
 */

const SEV_LABEL: Record<QualitySeverity, string> = { high: "높음", medium: "보통", low: "낮음" };
const SEV_TONE: Record<QualitySeverity, "red" | "amber" | "gray"> = {
  high: "red",
  medium: "amber",
  low: "gray",
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

export default function DataQuality() {
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

  const issues = useMemo(
    () => (data?.issues ?? []).filter((i) => sev === "all" || i.severity === sev),
    [data, sev]
  );

  /**
   * 그룹으로 묶어 본다 — 같은 규칙에 20곳이 걸리면 개별 항목 20줄보다 규칙 1줄이 낫다.
   * 키는 규칙 + 심각도다. 같은 규칙이라도 심각도가 갈리면(미회신은 높음, 대기는 보통) 따로 묶어야
   * '보통' 짜리가 '높음' 그룹에 섞여 개수가 부풀어 보이지 않는다.
   */
  const byRule = useMemo(() => {
    const m = new Map<string, QualityIssue[]>();
    for (const i of issues) {
      const k = `${i.rule}:${i.severity}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    }
    const order = { high: 0, medium: 1, low: 2 } as const;
    return [...m.entries()].sort(
      (a, b) => order[a[1][0].severity] - order[b[1][0].severity] || b[1].length - a[1].length
    );
  }, [issues]);

  async function copyAll() {
    if (!data) return;
    const text = [
      `[데이터 정합성 ${new Date().toISOString().slice(0, 10)}] 높음 ${data.counts.high} · 보통 ${data.counts.medium} · 낮음 ${data.counts.low}`,
      ...data.issues.map((i) => `- [${SEV_LABEL[i.severity]}] ${i.subject} — ${i.title}`),
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Kpi
          label="심각도 높음"
          value={loading ? "—" : data?.counts.high ?? 0}
          tone="alert"
          hint="사용자에게 이미 보이는 문제"
          onClick={() => setSev(sev === "high" ? "all" : "high")}
          active={sev === "high"}
        />
        <Kpi
          label="보통"
          value={loading ? "—" : data?.counts.medium ?? 0}
          hint="곧 문제가 됨"
          onClick={() => setSev(sev === "medium" ? "all" : "medium")}
          active={sev === "medium"}
        />
        <Kpi
          label="낮음"
          value={loading ? "—" : data?.counts.low ?? 0}
          hint="비어 있는 칸"
          onClick={() => setSev(sev === "low" ? "all" : "low")}
          active={sev === "low"}
        />
        <Kpi
          label="점검 대상"
          value={loading ? "—" : data?.checked.restaurants ?? 0}
          suffix="매장"
          hint={data ? `혜택 ${data.checked.benefits} · 기획전 ${data.checked.featured}` : undefined}
        />
      </div>

      {/* 백엔드를 못 읽으면 규칙 대부분이 침묵한다. "이상 없음"과 반드시 구별해야 한다. */}
      {data && !data.backend_reachable && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <p className="text-xs font-semibold text-red-700">백엔드를 읽지 못했습니다</p>
          <p className="text-[11px] text-red-600 mt-0.5 leading-relaxed">
            매장·혜택·기획전을 비교하는 규칙이 전부 침묵합니다. 아래가 비어 있어도 <strong>이상 없음이 아닙니다.</strong>
          </p>
        </div>
      )}

      <Card
        padded={false}
        title="발견된 불일치"
        desc="각 항목은 '어느 데이터를 비교했는지'와 '어디서 고치는지'를 같이 보여줍니다."
        right={
          <div className="flex items-center gap-2">
            {data?.draft && <DraftBadge note={data.draft_note} />}
            <button
              onClick={copyAll}
              aria-live="polite"
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[11px] font-semibold text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:border-periwinkle"
            >
              {copied ? "복사됨" : "슬랙용 복사"}
            </button>
            <button
              onClick={load}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[11px] font-semibold text-white bg-navy rounded-lg px-2.5 py-1.5 hover:bg-periwinkle"
            >
              다시 점검
            </button>
          </div>
        }
      >
        {loading ? (
          <Spinner />
        ) : issues.length === 0 ? (
          <Empty
            title={data?.backend_reachable ? "불일치가 없습니다" : "판정할 수 없습니다"}
            detail={
              data?.backend_reachable
                ? "지금 규칙 기준으로는 어긋난 데이터가 없습니다. 규칙은 늘려가면 됩니다."
                : "백엔드 연결을 먼저 확인하세요."
            }
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {byRule.map(([rule, list]) => (
              <div key={rule} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <Chip tone={SEV_TONE[list[0].severity]}>{SEV_LABEL[list[0].severity]}</Chip>
                  <p className="text-xs font-semibold text-gray-800 flex-1">{list[0].title}</p>
                  <span className="text-[10px] font-semibold text-gray-400">{list.length}곳</span>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">{list[0].detail}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {list.map((i) => (
                    <span
                      key={i.id}
                      className="text-[10px] bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5 text-gray-600"
                    >
                      {i.subject}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
                  <span className="text-periwinkle font-medium">→ {list[0].hint}</span>
                  <span className="text-gray-400">
                    비교: <code className="bg-gray-50 px-1 rounded">{list[0].source}</code>
                  </span>
                  <span className="text-gray-300">규칙 {rule.split(":")[0]}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-[10px] text-gray-400 px-1 leading-relaxed">
        다음 단계: 이 점검을 매일 아침 크론으로 돌려 <span className="font-semibold text-gray-500">높음</span> 이
        새로 생겼을 때만 슬랙에 올립니다. 매일 다 올리면 아무도 안 봅니다.
      </p>
    </div>
  );
}
