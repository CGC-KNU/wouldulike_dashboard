"use client";

import { useEffect, useMemo, useState } from "react";
import type { CastorEdge, CastorGraph, CastorScreen } from "@/lib/draft/types";
import { Card, Chip, Empty, Kpi, Spinner } from "../_shared/ui";

/**
 * Castor · 화면 지도.
 *
 * 사람이 화면 목록을 손으로 유지하면 반드시 실제와 어긋난다. 그래서 **코드가 유일한 진실**이고
 * Castor 는 읽기만 한다 — `node scripts/castor-parse.mjs --post` 가 라우트·이동·블록을 뽑아
 * `/api/castor/graph` 로 밀어 넣는다. CI 에 한 줄 얹으면 배포할 때마다 지도가 갱신된다.
 *
 * Castor 가 아닌 것을 먼저 못 박아 둔다:
 *   · 피그마 대체가 아니다 — 픽셀은 계속 피그마에서. 여기는 **구조와 순서**만 다룬다.
 *   · 노코드 빌더가 아니다 — 여기서 바꾼 게 그대로 앱이 되지 않는다. **결과는 스펙**이다.
 *   · A/B 측정 도구가 아니다 — 후보를 만드는 곳이고, 노출·측정은 앱과 Probe 가 한다.
 *
 * 정적 분석은 완벽할 수 없다. 못 잡은 이동 수를 숨기지 않고 그대로 띄우는 이유다 —
 * 숨기면 사람이 지도를 100% 믿어버리고, 틀렸다는 걸 한참 뒤에 안다.
 */

export default function CastorMap({ onDraftVariant }: { onDraftVariant?: (screen: CastorScreen, blocks: string[]) => void }) {
  const [graph, setGraph] = useState<CastorGraph | null>(null);
  const [unresolved, setUnresolved] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/castor/graph")
      .then((r) => r.json())
      .then((d) => {
        setGraph(d.graph ?? null);
        setUnresolved(d.graph?.unresolved ?? 0);
        const first = d.graph?.screens?.[0]?.id ?? null;
        setSelected(first);
      })
      .catch(() => setGraph(null))
      .finally(() => setLoading(false));
  }, []);

  const screens = graph?.screens ?? [];
  const edges = graph?.edges ?? [];

  const current = useMemo(() => screens.find((s) => s.id === selected) ?? null, [screens, selected]);

  useEffect(() => {
    setOrder(current?.blocks ?? []);
  }, [current]);

  /** 라우트 접두사로 묶는다 — /dashboard/admin/* 처럼 한 덩어리로 보는 게 사람 머릿속과 같다. */
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

  if (loading) {
    return (
      <Card>
        <Spinner />
      </Card>
    );
  }

  if (!screens.length) {
    return (
      <Card>
        <Empty
          title="아직 화면 지도가 없습니다"
          detail="Castor 는 코드를 읽어 지도를 그립니다. 아래 명령을 한 번 돌리면 이 화면이 채워집니다."
          action={
            <div className="inline-block text-left bg-gray-900 text-gray-100 rounded-xl px-4 py-3 font-mono text-[11px] leading-relaxed">
              <div>node scripts/castor-parse.mjs --post</div>
              <div className="text-gray-500 mt-1"># CI 라면 배포 워크플로에 이 한 줄</div>
            </div>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Kpi label="화면" value={screens.length} />
        <Kpi label="이동" value={edges.length} hint="Link · router.push · redirect" />
        <Kpi label="조건 분기" value={graph?.guards.length ?? 0} hint="middleware 매처" />
        <Kpi
          label="못 잡은 이동"
          value={unresolved}
          tone="alert"
          hint="변수로 만든 경로 — 손으로 보정 필요"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-start">
        {/* 화면 트리 */}
        <Card padded={false} title="화면">
          <div className="max-h-[28rem] overflow-y-auto">
            {groups.map(([key, list]) => (
              <div key={key}>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  /{key}
                </p>
                <ul>
                  {list.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => setSelected(s.id)}
                        className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation w-full text-left px-4 py-2 text-[11px] transition-colors ${
                          selected === s.id
                            ? "bg-navy/5 text-navy font-semibold border-l-2 border-navy"
                            : "text-gray-600 hover:bg-gray-50 border-l-2 border-transparent"
                        }`}
                      >
                        <span className="block truncate">{s.route}</span>
                        <span className="block text-[10px] text-gray-400">블록 {s.blocks.length}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        {/* 선택한 화면 */}
        {current && (
          <div className="space-y-4">
            <Card title={current.route} desc={current.file}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 mb-1.5">들어오는 길 ({incoming.length})</p>
                  {incoming.length === 0 ? (
                    <p className="text-[11px] text-gray-400">
                      코드에서 이 화면으로 가는 링크를 찾지 못했습니다. 딥링크·외부 진입만 있을 수 있습니다.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {incoming.map((e, i) => (
                        <EdgeRow key={i} edge={e} label={e.from} dir="in" onGo={() => setSelected(e.from)} />
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 mb-1.5">나가는 길 ({outgoing.length})</p>
                  {outgoing.length === 0 ? (
                    <p className="text-[11px] text-gray-400">막다른 화면입니다.</p>
                  ) : (
                    <ul className="space-y-1">
                      {outgoing.map((e, i) => (
                        <EdgeRow key={i} edge={e} label={e.to} dir="out" onGo={() => setSelected(e.to)} />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Card>

            <Card
              title="블록 배치"
              desc="순서를 바꿔보고, 마음에 들면 A/B 후보로 넘깁니다. 여기서 바꾼다고 앱이 바뀌지는 않습니다."
              right={
                dirty && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setOrder(current.blocks)}
                      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[11px] font-semibold text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:border-periwinkle"
                    >
                      되돌리기
                    </button>
                    <button
                      onClick={() => onDraftVariant?.(current, order)}
                      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[11px] font-semibold text-white bg-navy rounded-lg px-2.5 py-1.5 hover:bg-periwinkle"
                    >
                      A/B 후보로
                    </button>
                  </div>
                )
              }
            >
              {order.length === 0 ? (
                <p className="text-[11px] text-gray-400">
                  이 파일에서 최상위 컴포넌트를 찾지 못했습니다. 화면이 인라인 JSX 로만 짜여 있을 수 있습니다.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {order.map((b, i) => (
                    <li key={`${i}-${b}`} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <span className="w-5 text-[10px] font-semibold text-gray-400">{i + 1}</span>
                      <span className="flex-1 text-[11px] font-medium text-gray-700">{b}</span>
                      {current.blocks[i] !== b && <Chip tone="amber">이동됨</Chip>}
                      <button
                        disabled={i === 0}
                        aria-label={`${b} 위로`}
                        onClick={() => setOrder(swap(order, i, i - 1))}
                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[11px] text-gray-400 disabled:opacity-20 hover:text-navy px-1"
                      >
                        ↑
                      </button>
                      <button
                        disabled={i === order.length - 1}
                        aria-label={`${b} 아래로`}
                        onClick={() => setOrder(swap(order, i, i + 1))}
                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation text-[11px] text-gray-400 disabled:opacity-20 hover:text-navy px-1"
                      >
                        ↓
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>

      {graph && (
        <p className="text-[10px] text-gray-400 px-1">
          {graph.source.repo}
          {graph.source.commit && ` @ ${graph.source.commit}`} ·{" "}
          {graph.generated_at && `파싱 ${new Date(graph.generated_at).toLocaleString("ko-KR")}`}
        </p>
      )}
    </div>
  );
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  const next = [...arr];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

function EdgeRow({
  edge,
  label,
  dir,
  onGo,
}: {
  edge: CastorEdge;
  label: string;
  dir: "in" | "out";
  onGo: () => void;
}) {
  return (
    <li>
      <button
        onClick={onGo}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-periwinkle/60 touch-manipulation w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-gray-50"
      >
        <span className="text-[11px] text-gray-400">{dir === "in" ? "←" : "→"}</span>
        <span className="flex-1 text-[11px] font-medium text-gray-700 truncate">{label}</span>
        <Chip tone={edge.kind === "manual" ? "amber" : "gray"}>{edge.kind}</Chip>
      </button>
    </li>
  );
}
