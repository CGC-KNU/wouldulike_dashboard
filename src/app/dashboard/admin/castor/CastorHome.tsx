"use client";

import { useEffect, useState } from "react";
import { IconBrandSlack } from "@tabler/icons-react";
import type { CastorExperiment, CastorGraph } from "@/lib/draft/types";
import { TOOLS, slackUrl } from "@/lib/satellite";
import { Button, Card, Chip, Kpi, PageHeader, Skeleton, type ChipTone } from "../_shared/ui";

/** Castor · 홈. 지도가 있는지, 실험이 몇 개 도는지, 파서를 언제 돌렸는지. */

const STATUS_TONE: Record<CastorExperiment["status"], ChipTone> = { draft: "gray", running: "blue", done: "green", abandoned: "red" };
const STATUS_LABEL: Record<CastorExperiment["status"], string> = { draft: "초안", running: "진행 중", done: "종료", abandoned: "중단" };

export default function CastorHome({ onGo }: { onGo: (tab: string) => void }) {
  const [graph, setGraph] = useState<CastorGraph | null | undefined>(undefined);
  const [exps, setExps] = useState<CastorExperiment[] | undefined>(undefined);

  useEffect(() => {
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    j("/api/castor/graph").then((d) => setGraph(d?.graph ?? null));
    j("/api/castor/experiments").then((d) => setExps(d?.experiments ?? []));
  }, []);

  const loading = graph === undefined || exps === undefined;
  const running = (exps ?? []).filter((e) => e.status === "running").length;
  const castor = TOOLS.castor;

  return (
    <>
      <PageHeader
        title="앱 구조 홈"
        description="코드에서 뽑은 화면 지도와, 그 위에서 만든 A/B 후보. 앱을 바꾸기 전에 여기서 바꿔 봅니다."
        actions={<a href={slackUrl(castor)} target="_blank" rel="noreferrer"><Button icon={<IconBrandSlack />}>#{castor.slack.channel}</Button></a>}
      />

      <div className="sat-stagger grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <Kpi label="화면" value={loading ? "-" : graph?.screens.length ?? 0} hint={graph?.source.commit ? `커밋 ${graph.source.commit}` : "아직 파싱 전"} onClick={() => onGo("castor-map")} />
        <Kpi label="이동" value={loading ? "-" : graph?.edges.length ?? 0} hint="Link · push · redirect" onClick={() => onGo("castor-map")} />
        <Kpi label="못 잡은 이동" value={loading ? "-" : graph?.unresolved ?? 0} tone="alert" hint="손으로 보정할 것" onClick={() => onGo("castor-map")} />
        <Kpi label="진행 중 실험" value={loading ? "-" : running} hint={`전체 ${exps?.length ?? 0}건`} onClick={() => onGo("castor-experiments")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="A/B 후보" actions={<Button size="sm" variant="ghost" onClick={() => onGo("castor-experiments")}>열기</Button>}>
          {loading ? <Skeleton rows={3} cols={2} /> : (exps ?? []).length === 0 ? (
            <p className="text-[13px] text-gray-500">아직 실험이 없습니다. 화면 지도에서 블록 순서를 바꾼 뒤 A/B 후보로 보내면 여기 쌓입니다.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {(exps ?? []).slice(0, 5).map((e) => (
                <li key={e.id} className="py-2 flex items-start gap-2">
                  <Chip tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Chip>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-gray-900 line-clamp-1">{e.hypothesis}</span>
                    <span className="block text-[12px] text-gray-500">{e.metric.primary} · {e.period.from} 부터 {e.period.days}일</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="지도 갱신" description="배포마다 CI 가 돌리면 항상 최신입니다.">
          <pre className="bg-gray-900 text-gray-100 rounded-lg px-4 py-3 text-[12px] leading-relaxed overflow-x-auto">{"node scripts/castor-parse.mjs --post\n# CASTOR_INGEST_TOKEN 또는 로그인 쿠키(CASTOR_COOKIE) 필요"}</pre>
          <p className="text-[12px] text-gray-500 mt-2">
            {graph?.generated_at ? `마지막 파싱 ${new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(graph.generated_at))}` : "아직 한 번도 돌리지 않았습니다."}
          </p>
        </Card>
      </div>
    </>
  );
}
