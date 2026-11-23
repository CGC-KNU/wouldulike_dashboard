import { NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { fetchBackendJson } from "@/lib/draft/toolProxy";
import { normalizeTrend, type RawTrend } from "@/lib/draft/insightsTrend";
import { isPartnerPost } from "@/lib/draft/partnerMatch";
import { isPreview, previewRestaurants } from "@/lib/draft/previewStores";
import type { BackendRestaurant } from "@/lib/draft/types";

/**
 * Probe · 인스타 성과 **추이** — 매장 리포트 화면 아래 패널.
 *
 * 백엔드 `/api/probe/insights/summary/` 가 우리 DB(satellite Post·PostMetric)에서 센 값을 그대로 넘긴다.
 * `/api/probe/insights`(게시물 목록)와 달리 Papillon 을 부르지 않는다 — 느려질 이유가 없다.
 *
 * 1123 민찬: 제휴 매장 게시물과 아닌 게시물을 나눠 본다. 점마다 기획 제목(백엔드)을 매장 리포트 목록과 **같은 규칙**
 * (lib/draft/partnerMatch)으로 읽어 `partner` 를 붙인다 — 그래서 앱 매장 표를 한 번 더 읽는다(협찬 이름은 백엔드가 같이 준다).
 * 기획이 없는 게시물은 제휴 아님. 매장 표를 못 읽었거나 옛 백엔드(제목 없음)면 `split.ok = false` — 화면은 나누지 않는다
 * (앱 매장 이름으로 잡히는 게시물을 「제휴 아님」으로 세면 안 되니까).
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
  /** 같은 스냅샷의 저장 · 도달 — 매장 리포트 「제휴 아님」 줄(1123). 옛 백엔드는 없다 */
  saved?: number | null;
  reach?: number | null;
  /** Papillon 기획 — 없으면 null · "" (인스타에서 바로 올린 게시물) */
  plan_id?: number | null;
  topic?: string;
  /** 제휴 매장 게시물인가 — 이 라우트가 붙인다. split.ok 가 false 면 믿지 않는다 */
  partner?: boolean;
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
  /** 제휴 · 제휴 아님을 나눴는가(1123). 못 나눴으면 이유 */
  split?: { ok: boolean; reason?: string };
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
  const [data, stores] = await Promise.all([
    fetchBackendJson<Omit<SummaryPayload, "trend"> & { trend?: RawTrend & { sponsor_names?: string[] } }>("/api/probe/insights/summary/", `months=${months}&weeks=${weeks}`),
    fetchBackendJson<{ restaurants?: BackendRestaurant[] }>("/api/dashboard/restaurants/"),
  ]);
  if (!data) {
    // 0 으로 채운 빈 표를 내려보내면 "성과가 0"으로 읽힌다 — 못 읽었다고 말한다
    return NextResponse.json({ detail: "성과 추이를 읽지 못했습니다." }, { status: 503 });
  }
  const out: SummaryPayload = { ...data, trend: data.trend ? splitTrend(normalizeTrend(data.trend), data.trend.sponsor_names, stores?.restaurants ?? (isPreview() ? previewRestaurants() : null)) : undefined };
  return NextResponse.json(out);
}

/** 점마다 제휴 여부 — 매장 리포트 목록(insights.ts)과 같은 매장 표(제휴 켜진 곳) · 같은 규칙 */
function splitTrend(t: Trend, sponsorNames: string[] | undefined, restaurants: BackendRestaurant[] | null): Trend {
  if (!sponsorNames || t.points.some((p) => p.topic === undefined)) return { ...t, split: { ok: false, reason: "백엔드가 아직 기획 제목을 주지 않습니다 — 백엔드 배포 뒤 다시 읽어 주세요." } };
  if (!restaurants) return { ...t, split: { ok: false, reason: "앱 매장 표를 읽지 못해 제휴 매장 게시물을 가르지 못했습니다." } };
  const affiliates = restaurants.filter((r) => r.is_affiliate !== false);
  const sponsorships = sponsorNames.map((store_name) => ({ store_name }));
  return { ...t, points: t.points.map((p) => ({ ...p, partner: p.plan_id != null && isPartnerPost(p.topic, affiliates, sponsorships) })), split: { ok: true } };
}
