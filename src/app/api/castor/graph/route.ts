import { NextRequest, NextResponse } from "next/server";
import { readDraft, writeDraft } from "@/lib/draft/store";
import { seedCastorGraph } from "@/lib/draft/seed";
import type { CastorEdge, CastorGraph } from "@/lib/draft/types";
import { hasIngestToken, requireTool } from "@/lib/draft/guard";

/**
 * Castor 화면 그래프.
 *
 * 사람이 화면 목록을 손으로 유지하면 반드시 실제와 어긋난다. **코드가 유일한 진실**이고
 * Castor 는 그걸 읽기만 한다 — `scripts/castor-parse.mjs` 가 뽑아 여기로 POST 한다.
 *
 * 정적 분석은 완벽할 수 없다(변수로 만든 경로, 조건부 렌더). 그래서 사람이 툴에서 그은
 * 보정(overrides)은 **재파싱해도 덮어쓰지 않고 병합**한다. 이 규칙이 없으면 코드가 바뀔
 * 때마다 사람 작업이 날아간다.
 */

const GRAPH = "castor_graph";
const OVERRIDES = "castor_overrides";

interface Override {
  id: string;
  type: "edge" | "screen" | "note";
  payload: CastorEdge | Record<string, unknown>;
}

export async function GET() {
  const deny = await requireTool("admin");
  if (deny) return deny;
  const graph = readDraft<CastorGraph>(GRAPH, seedCastorGraph);
  const overrides = readDraft<Override[]>(OVERRIDES, () => []);

  const manualEdges = overrides
    .filter((o) => o.type === "edge")
    .map((o) => ({ ...(o.payload as CastorEdge), kind: "manual" as const }));

  return NextResponse.json({
    graph: { ...graph, edges: [...graph.edges, ...manualEdges] },
    overrides,
    parsed: graph.screens.length > 0,
    draft: true,
    draft_note:
      graph.screens.length > 0
        ? undefined
        : "아직 파싱 결과가 없습니다. `node scripts/castor-parse.mjs` 를 한 번 돌리세요.",
  });
}

/** 파서(CI 또는 로컬)가 그래프를 밀어 넣는 자리. 보정분은 건드리지 않는다. */
export async function POST(req: NextRequest) {
  // CI 는 사용자 토큰이 없다 — X-Castor-Token 으로 대신한다. 둘 다 없으면 막는다.
  if (!hasIngestToken(req)) {
    const deny = await requireTool("admin");
    if (deny) return deny;
  }
  const body = (await req.json()) as CastorGraph;
  if (!Array.isArray(body?.screens)) {
    return NextResponse.json({ detail: "screens 배열이 필요합니다." }, { status: 400 });
  }
  const saved = writeDraft<CastorGraph>(GRAPH, {
    ...body,
    generated_at: body.generated_at || new Date().toISOString(),
  });
  return NextResponse.json({ graph: saved, screens: saved.screens.length, edges: saved.edges.length });
}
