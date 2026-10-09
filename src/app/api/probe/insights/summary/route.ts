import { NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { normalizeTrend, type RawTrend } from "@/lib/draft/insightsTrend";

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
/**
 * 게시물 하나 — 1006 개편. `timely` 는 게시 후 N~N+2일에 잰 값(N = Trend.day — 1009 부터 14, 그 전 7),
 * `late` 는 N일차를 제때 못 재서 **지금까지 쌓인 값**(정밀 수집이 9/10 에 시작돼 그 전 게시물은 다 이쪽이다),
 * `pending` 은 아직 N일차가 올 수 있는 것, `none` 은 수치가 없는 것. 옛 백엔드의 `d7` 은 normalizeTrend 가 `timely` 로 바꾼다.
 */
export interface TrendPoint {
  id: number;
  posted_at: string;
  format: string;
  permalink: string;
  basis: "timely" | "late" | "pending" | "none";
  views: number | null;
  /** 게시 후 며칠째에 잰 값인가 */
  measured_days: number | null;
}
export interface TrendMonth {
  period: string;
  label: string;
  posts: number;
  /** 포맷별 발행 수 · N일차를 제때 잰 건수 · N일차 조회 중앙값(5건부터, 아니면 null) */
  by_format: Record<string, { posts: number; timely: number; views_median: number | null }>;
}
export interface Trend {
  /** 점 · 중앙값이 게시 후 며칠차 값인가 — 1009 백엔드부터 14. 옛 백엔드는 안 보내서 normalizeTrend 가 7 로 채운다 */
  day: number;
  /** 첫 게시 달부터 이번 달까지, 빈 달도 0 으로 — 오래된 달부터 */
  months: TrendMonth[];
  recent: { days: number; posts: number; by_format: Record<string, number> };
  points: TrendPoint[];
  counts: Record<TrendPoint["basis"], number>;
  /** 인스타에서 지워진(보관된) 게시물 — 발행 수에서 뺐다 */
  archived_excluded: number;
}
export interface SummaryPayload {
  generated_at: string;
  total: Bucket;
  months: Bucket[];
  weeks: Bucket[];
  posts_without_metrics?: number;
  no_data?: boolean;
  /** 백엔드 #110 부터. 그 전 백엔드면 없다 */
  trend?: Trend;
}

export async function GET(req: Request) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;

  const q = new URL(req.url).searchParams;
  const months = q.get("months") ?? "6";
  const weeks = q.get("weeks") ?? "8";
  const data = await fetchBackendJson<Omit<SummaryPayload, "trend"> & { trend?: RawTrend }>("/api/probe/insights/summary/", `months=${months}&weeks=${weeks}`);
  if (!data) {
    // 0 으로 채운 빈 표를 내려보내면 "성과가 0"으로 읽힌다 — 못 읽었다고 말한다
    return NextResponse.json({ detail: "성과 추이를 읽지 못했습니다." }, { status: 503 });
  }
  const out: SummaryPayload = { ...data, trend: data.trend ? normalizeTrend(data.trend) : undefined };
  return NextResponse.json(out);
}
