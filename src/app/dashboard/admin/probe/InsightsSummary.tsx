"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { Button, Card, Chip, Empty, FilterPills, Kpi, Notice, PanelSection, Skeleton, Table, Td, Th } from "../_shared/ui";
import type { Bucket, SummaryPayload } from "@/app/api/probe/insights/summary/route";

/**
 * Probe · 인스타 성과 **추이** — 매장 리포트 화면 아래.
 *
 * 점주 리포트의 「평소 범위」는 p10~p90(80% 구간)이라 이 계정에서는 거의 모든 값이 그 안에 들어온다
 * (백엔드 cohort.py: 인게이지 중앙값 61 · 최고 4,270 · CV 2.9). "이번 편이 잘 나갔나"는 답해도
 * **"요즘 우리가 잘하고 있나"** 는 아무도 답하지 못했다 — 그 자리다.
 *
 * 화면이 지키는 것(백엔드와 같은 규칙):
 *  · 포맷별 중앙값은 **따로** 보여 준다. 릴스와 카드뉴스를 한 줄에 합치지 않는다.
 *  · 주간에는 중앙값이 아예 없다(백엔드가 null 로 준다) — 주 4~5건짜리 중앙값은 소음이다.
 *  · 값이 없는 칸은 「—」다. 0 으로 그리지 않는다.
 */

const FORMAT_KO: Record<string, string> = { carousel: "카드뉴스", reel: "릴스", image: "기타" };
const n = (v: number | null | undefined) => (typeof v === "number" ? v.toLocaleString() : "—");

type Scope = "total" | "months" | "weeks";

export default function InsightsSummary() {
  const [data, setData] = useState<SummaryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<Scope>("months");

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

  const rows: Bucket[] = useMemo(
    () => (!data ? [] : scope === "months" ? data.months : scope === "weeks" ? data.weeks : [data.total]),
    [data, scope]
  );
  // 포맷 칼럼은 실제로 나온 것만 — 릴스를 한 번도 안 올린 달에 빈 칸을 만들지 않는다
  const formats = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) for (const f of Object.keys(r.by_format ?? {})) seen.add(f);
    return [...seen].sort();
  }, [rows]);

  const t = data?.total;
  const showMedian = scope !== "weeks";

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
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
            <Kpi label="발행" value={t?.posts ?? 0} suffix="건" hint="수치가 한 번도 안 들어온 건은 뺐습니다" />
            <Kpi label="조회 합" value={t?.views ?? 0} />
            <Kpi label="저장 합" value={t?.saved ?? 0} />
            <Kpi label="참여 합" value={t?.engagement ?? 0} hint="저장+공유+좋아요+댓글" />
          </div>

          {(t?.pending_d7 ?? 0) > 0 && (
            <div className="mb-3">
              <Notice tone="blue" title={`${t!.pending_d7}건은 아직 D+7 이 안 됐습니다`}>
                그 건들은 지금까지 쌓인 값(최신 일일 스냅샷)으로 셌습니다. 며칠 뒤 다시 보면 숫자가 올라갑니다 —
                같은 시점끼리 비교하려면 D+7 을 기다려야 합니다.
              </Notice>
            </div>
          )}
          {(data.posts_without_metrics ?? 0) > 0 && (
            <div className="mb-3">
              <Notice tone="amber" title={`${data.posts_without_metrics}건은 수치가 한 번도 안 들어왔습니다`}>
                건수·합계 어디에도 넣지 않았습니다. 0 으로 세면 합계는 그대로인데 건수만 늘어 평균이 내려갑니다.
              </Notice>
            </div>
          )}

          <div className="mb-3">
            <FilterPills<Scope>
              label="기간"
              value={scope}
              onChange={setScope}
              options={[
                { key: "total", label: "전체" },
                { key: "months", label: "월간", count: data.months.length },
                { key: "weeks", label: "주간", count: data.weeks.length },
              ]}
            />
          </div>

          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>기간</Th>
                  <Th align="right">발행</Th>
                  <Th align="right">조회</Th>
                  <Th align="right">저장</Th>
                  <Th align="right">참여</Th>
                  {showMedian && formats.map((f) => <Th key={f} align="right">{FORMAT_KO[f] ?? f} 조회 중앙값</Th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.period ?? `total-${i}`}>
                    <Td>
                      <span className="font-medium text-gray-900">{r.label ?? "전체 누적"}</span>
                      {r.start && <span className="ml-1.5 text-[11px] text-gray-400">{r.start.slice(5)}~{r.end?.slice(5)}</span>}
                      {r.pending_d7 > 0 && <Chip tone="blue">D+7 전 {r.pending_d7}</Chip>}
                    </Td>
                    <Td align="right">{n(r.posts)}</Td>
                    <Td align="right">{n(r.views)}</Td>
                    <Td align="right">{n(r.saved)}</Td>
                    <Td align="right">{n(r.engagement)}</Td>
                    {showMedian && formats.map((f) => {
                      const s = r.by_format?.[f];
                      return (
                        <Td key={f} align="right">
                          {s ? (
                            <>
                              {n(s.views_median)}
                              <span className="ml-1 text-[11px] text-gray-400">{s.posts}건</span>
                            </>
                          ) : "—"}
                        </Td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <p className="mt-2.5 text-[11.5px] text-gray-500 leading-relaxed">
            {showMedian
              ? "포맷별 중앙값은 발행 5건 이상일 때만 냅니다 — 그보다 적으면 「—」입니다(0 이 아닙니다). 릴스와 카드뉴스는 조회 자릿수가 달라 한 줄에 합치지 않습니다."
              : "주간에는 중앙값을 내지 않습니다 — 팀 발행이 주 4~5건이라 그 표본의 중앙값은 소음입니다. 건수와 합계로 보십시오."}
            {" "}비교는 D+7 스냅샷끼리 합니다.
          </p>
        </>
      )}
    </PanelSection>
  );
}
