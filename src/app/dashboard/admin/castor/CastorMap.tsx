"use client";

import { useEffect, useMemo, useState } from "react";
import { IconArrowDown, IconArrowUp, IconArrowsExchange, IconRotate } from "@tabler/icons-react";
import type { CastorEdge, CastorGraph, CastorScreen } from "@/lib/draft/types";
import { Button, Card, Chip, Empty, Kpi, PageHeader, Skeleton, focusRing } from "../_shared/ui";

/**
 * Castor · 화면 지도.
 *
 * 사람이 화면 목록을 손으로 유지하면 반드시 실제와 어긋난다. 코드가 유일한 진실이고 Castor 는 읽기만 한다.
 * `node scripts/castor-parse.mjs --post` 가 라우트·이동·블록을 뽑아 밀어 넣는다.
 *
 * Castor 가 아닌 것: 피그마 대체가 아니다(픽셀은 피그마). 노코드 빌더가 아니다(결과는 스펙). A/B 측정 도구가 아니다(측정은 Probe).
 * 정적 분석은 완벽할 수 없다. 못 잡은 이동 수를 숨기지 않는다. 숨기면 사람이 지도를 100% 믿고 늦게 안다.
 */

export default function CastorMap({ onDraftVariant }: { onDraftVariant?: (screen: CastorScreen, blocks: string[]) => void }) {
  const [graph, setGraph] = useState<CastorGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/castor/graph")
      .then((r) => r.json())
      .then((d) => {
        setGraph(d.graph ?? null);
        setSelected(d.graph?.screens?.[0]?.id ?? null);
      })
      .catch(() => setGraph(null))
      .finally(() => setLoading(false));
  }, []);

  const screens = graph?.screens ?? [];
  const edges = graph?.edges ?? [];
  const current = useMemo(() => screens.find((s) => s.id === selected) ?? null, [screens, selected]);
  useEffect(() => setOrder(current?.blocks ?? []), [current]);

  const groups = useMemo(() => {
    const m = new Map<string, CastorScreen[]>();
    for (const s of screens) {
      const key = s.route.split("/").filter(Boolean)[0] ?? "/";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [screens]);

  const incoming = useMemo(() => edges.filter((e) => e.to === selected), [edges, selected]);
  const outgoing = useMemo(() => edges.filter((e) => e.from === selected), [edges, selected]);
  const dirty = current ? order.join("|") !== current.blocks.join("|") : false;

  return (
    <>
      <PageHeader
        title="화면 지도"
        description="코드에서 자동으로 뽑은 화면과 이동 경로입니다. 손으로 유지하는 목록이 아니라 배포마다 다시 그려집니다."
        actions={
          graph?.generated_at && (
            <span className="text-[12px] text-gray-500">
              {graph.source.commit && <code className="bg-gray-100 px-1 rounded mr-1">{graph.source.commit}</code>}
              {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(graph.generated_at))} 파싱
            </span>
          )
        }
      />

      {loading ? (
        <Card flush><Skeleton rows={6} cols={3} /></Card>
      ) : screens.length === 0 ? (
        <Card>
          <Empty
            title="아직 화면 지도가 없습니다"
            detail="Castor 는 코드를 읽어 지도를 그립니다. 아래 명령을 한 번 돌리면 이 화면이 채워집니다."
            action={
              <pre className="text-left bg-gray-900 text-gray-100 rounded-xl px-4 py-3 text-[12px] leading-relaxed">
                {"node scripts/castor-parse.mjs --post\n# CI 라면 배포 워크플로에 이 한 줄"}
              </pre>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
            <Kpi label="화면" value={screens.length} />
            <Kpi label="이동" value={edges.length} hint="Link · router.push · redirect" />
            <Kpi label="조건 분기" value={graph?.guards.length ?? 0} hint="middleware 매처" />
            <Kpi label="못 잡은 이동" value={graph?.unresolved ?? 0} tone="alert" hint="변수로 만든 경로. 손으로 보정" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)] gap-4 items-start">
            <Card flush title="화면">
              <nav className="max-h-[32rem] overflow-y-auto py-1" aria-label="화면 목록">
                {groups.map(([key, list]) => (
                  <div key={key}>
                    <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400">/{key}</p>
                    <ul>
                      {list.map((s) => {
                        const on = selected === s.id;
                        return (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => setSelected(s.id)}
                              aria-current={on ? "true" : undefined}
                              className={`w-full text-left px-4 py-2 text-[13px] border-l-2 transition-colors ${focusRing} ${
                                on ? "border-navy bg-navy/5 text-navy font-semibold" : "border-transparent text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              <span className="block truncate">{s.route}</span>
                              <span className="block text-[11px] text-gray-400">블록 {s.blocks.length}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>
            </Card>

            {current && (
              <div className="space-y-4">
                <Card title={current.route} description={current.file}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <EdgeList title="들어오는 길" edges={incoming} pick={(e) => e.from} dir="in" onGo={setSelected} emptyText="코드에서 이 화면으로 가는 링크를 찾지 못했습니다. 딥링크·외부 진입만 있을 수 있습니다." />
                    <EdgeList title="나가는 길" edges={outgoing} pick={(e) => e.to} dir="out" onGo={setSelected} emptyText="막다른 화면입니다." />
                  </div>
                </Card>

                <Card
                  title="블록 배치"
                  description="순서를 바꿔 보고 마음에 들면 A/B 후보로 넘깁니다. 여기서 바꾼다고 앱이 바뀌지는 않습니다."
                  actions={
                    dirty && (
                      <>
                        <Button size="sm" icon={<IconRotate />} onClick={() => setOrder(current.blocks)}>되돌리기</Button>
                        <Button size="sm" variant="primary" icon={<IconArrowsExchange />} onClick={() => onDraftVariant?.(current, order)}>A/B 후보로 보내기</Button>
                      </>
                    )
                  }
                >
                  {order.length === 0 ? (
                    <p className="text-[13px] text-gray-500">이 파일에서 최상위 컴포넌트를 찾지 못했습니다. 화면이 인라인 JSX 로만 짜여 있을 수 있습니다.</p>
                  ) : (
                    <ol className="space-y-1.5">
                      {order.map((b, i) => (
                        <li key={`${i}-${b}`} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                          <span className="w-5 text-[12px] font-semibold text-gray-400 tabular-nums">{i + 1}</span>
                          <span className="flex-1 text-[13px] font-medium text-gray-800">{b}</span>
                          {current.blocks[i] !== b && <Chip tone="amber">이동됨</Chip>}
                          <Button size="sm" variant="ghost" disabled={i === 0} aria-label={`${b} 위로`} icon={<IconArrowUp />} onClick={() => setOrder(swap(order, i, i - 1))} />
                          <Button size="sm" variant="ghost" disabled={i === order.length - 1} aria-label={`${b} 아래로`} icon={<IconArrowDown />} onClick={() => setOrder(swap(order, i, i + 1))} />
                        </li>
                      ))}
                    </ol>
                  )}
                </Card>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  const next = [...arr];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

function EdgeList({
  title, edges, pick, dir, onGo, emptyText,
}: {
  title: string; edges: CastorEdge[]; pick: (e: CastorEdge) => string; dir: "in" | "out"; onGo: (id: string) => void; emptyText: string;
}) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-gray-500 mb-2">{title} ({edges.length})</p>
      {edges.length === 0 ? (
        <p className="text-[13px] text-gray-400">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {edges.map((e, i) => (
            <li key={i}>
              <button type="button" onClick={() => onGo(pick(e))} className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 ${focusRing}`}>
                <span className="text-gray-400 text-[12px]" aria-hidden="true">{dir === "in" ? "←" : "→"}</span>
                <span className="flex-1 text-[13px] font-medium text-gray-800 truncate">{pick(e)}</span>
                <Chip tone={e.kind === "manual" ? "amber" : "gray"}>{e.kind}</Chip>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
