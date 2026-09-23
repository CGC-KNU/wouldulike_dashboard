import { NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { fetchBackendJson } from "@/lib/draft/toolProxy";

/**
 * Probe · 인스타 성과 **추이** — 매장 리포트 화면 아래 패널.
 *
 * 백엔드 `/api/probe/insights/summary/` 가 우리 DB(satellite Post·PostMetric)에서 센 값을 그대로 넘긴다.
 * `/api/probe/insights`(게시물 목록)와 달리 Papillon 을 부르지 않는다 — 느려질 이유가 없다.
 */

export interface FormatStat {
  posts: number;
  /** 표본 5건 미만이면 null — 0 이 아니다 */
  views_median: number | null;
  saved_median: number | null;
}
export interface Bucket {
  period?: string;
  label?: string;
  start?: string;
  end?: string;
  posts: number;
  /** 아직 D7 이 안 된 게시물 수 — 최신 daily 로 대신 센 것 */
  pending_d7: number;
  views: number;
  reach: number;
  saved: number;
  shares: number;
  likes: number;
  comments: number;
  /** 저장+공유+좋아요+댓글 */
  engagement: number;
  by_format: Record<string, FormatStat>;
}
export interface SummaryPayload {
  generated_at: string;
  total: Bucket;
  months: Bucket[];
  weeks: Bucket[];
  posts_without_metrics?: number;
  no_data?: boolean;
}

export async function GET(req: Request) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;

  const q = new URL(req.url).searchParams;
  const months = q.get("months") ?? "6";
  const weeks = q.get("weeks") ?? "8";
  const data = await fetchBackendJson<SummaryPayload>("/api/probe/insights/summary/", `months=${months}&weeks=${weeks}`);
  if (!data) {
    // 0 으로 채운 빈 표를 내려보내면 "성과가 0"으로 읽힌다 — 못 읽었다고 말한다
    return NextResponse.json({ detail: "성과 추이를 읽지 못했습니다." }, { status: 503 });
  }
  return NextResponse.json(data);
}
