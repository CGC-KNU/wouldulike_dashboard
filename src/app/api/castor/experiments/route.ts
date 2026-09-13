import { NextRequest, NextResponse } from "next/server";
import { appendDraftItem, patchDraftItem, readDraft } from "@/lib/draft/store";
import { seedExperiments } from "@/lib/draft/seed";
import type { CastorExperiment } from "@/lib/draft/types";
import { requireTool } from "@/lib/draft/guard";

/**
 * A/B 후보 정의 — Castor 의 결과물.
 *
 * 필수 필드를 강제하는 게 이 엔드포인트의 일이다:
 *  · `hypothesis` — 가설 없는 A/B 는 낭비다. 한 문장으로 못 쓰면 실험하지 않는다.
 *  · `metric.primary` — 승패를 가를 단 하나의 숫자. 여러 개면 결국 유리한 걸 고르게 된다.
 *  · `period` — 기간을 미리 못 박는다. "좋아 보일 때 멈추기"를 막는 유일한 장치.
 */

const KEY = "castor_experiments";

export async function GET() {
  const deny = await requireTool("admin");
  if (deny) return deny;
  return NextResponse.json({
    experiments: readDraft<CastorExperiment[]>(KEY, seedExperiments),
    draft: true,
  });
}

export async function POST(req: NextRequest) {
  const deny = await requireTool("admin");
  if (deny) return deny;
  const body = (await req.json()) as Partial<CastorExperiment>;

  const missing: string[] = [];
  // A 와 B 가 같으면 실험이 아니다
  const sig = (v: { blocks?: string[] }) => (v.blocks ?? []).join("|");
  if (body.variants && body.variants.length >= 2 && new Set(body.variants.map(sig)).size < 2) {
    missing.push("서로 다른 후보안");
  }
  if (!body.hypothesis?.trim()) missing.push("가설(hypothesis)");
  if (!body.metric?.primary?.trim()) missing.push("주요 지표(metric.primary)");
  if (!body.period?.from || !body.period?.days) missing.push("기간(period)");
  if (!body.variants || body.variants.length < 2) missing.push("후보안 2개 이상");
  if (missing.length) {
    return NextResponse.json(
      { detail: `${missing.join(" · ")} 이(가) 없으면 실험을 만들 수 없습니다.` },
      { status: 400 }
    );
  }

  const created = appendDraftItem<CastorExperiment>(KEY, seedExperiments, {
    id: body.id ?? `exp-${Date.now()}`,
    hypothesis: body.hypothesis!.trim(),
    target: body.target ?? { screen: "", audience: "all" },
    variants: body.variants!,
    metric: { primary: body.metric!.primary, guard: body.metric!.guard ?? [] },
    period: body.period!,
    status: "draft",
    source: body.source ?? { commit: "" },
    created_by: body.created_by ?? "unknown",
    created_at: new Date().toISOString(),
  });
  return NextResponse.json({ experiment: created, draft: true }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const deny = await requireTool("admin");
  if (deny) return deny;
  const body = (await req.json()) as Partial<CastorExperiment> & { id: string };
  if (!body.id) return NextResponse.json({ detail: "id 가 필요합니다." }, { status: 400 });
  const updated = patchDraftItem<CastorExperiment>(KEY, seedExperiments, body.id, body);
  if (!updated) return NextResponse.json({ detail: "찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ experiment: updated, draft: true });
}
