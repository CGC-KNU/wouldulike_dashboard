import type { PromotionPost } from "./homeMetrics";

/**
 * 콘텐츠 탭 「게시물별 성과」 (1124). 웹 화면이 쓰고, 앱 파트너 모드도 같은 백엔드 칸(metrics.promotion.posts)을 읽는다.
 *
 * 숫자는 **게시물 전체** 값이다 — 여러 매장이 함께 나온 게시물이면 그 매장들이 같은 숫자를 본다.
 * 가게를 주어로 쓰지 않는다(「우리 가게를 본 사람」이 아니다).
 */

export const FORMAT_LABEL: Record<string, string> = { carousel: "카드뉴스", reel: "릴스", image: "사진" };

/** 0 은 보여 주고 null(못 잼)은 뺀다. 순서는 사장님이 먼저 볼 것부터. */
export function postStats(p: PromotionPost): { label: string; value: string }[] {
  const pairs: [string, number | null][] = [
    ["조회", p.views], ["도달", p.reach], ["좋아요", p.likes], ["저장", p.saved], ["공유", p.shares], ["댓글", p.comments],
  ];
  return pairs.filter(([, v]) => v != null).map(([label, v]) => ({ label, value: (v as number).toLocaleString("ko-KR") }));
}

/** 수치 아래 한 줄 — 언제 잰 숫자인지, 아직 못 쟀는지. */
export function postNote(p: PromotionPost): string {
  if (p.status === "pending" || !p.captured_at) return "집계 준비 중 — 게시 뒤 하루 안에 숫자가 들어옵니다";
  const md = `${+p.captured_at.slice(5, 7)}/${+p.captured_at.slice(8, 10)}`;
  return p.status === "stale" ? `${md} 수집 · 수집이 늦어지고 있습니다` : `${md} 수집`;
}

type FeedRow = { kind: string; date: string; title: string; state: string; permalink?: string; end?: string };

/**
 * 아래 일정 목록에서 위 성과 칸과 겹치는 게시물을 뺀다.
 * 성과 칸은 보낸 리포트·명시 연결로, 일정은 제목 대조로 고르므로 둘이 어긋날 수 있다 —
 * **성과 칸에 없는 게시된 글은 일정에 그대로 남긴다**(전에 보이던 것이 사라지지 않게).
 */
export function scheduleRows(feed: FeedRow[], posts: PromotionPost[]): FeedRow[] {
  const shown = new Set(posts.map((p) => p.permalink).filter(Boolean));
  const shownTitleDay = new Set(posts.map((p) => `${p.title}|${p.posted_at}`));
  return feed.filter((f) => f.kind === "campaign" || (f.kind === "post" && !(
    f.state === "published" && ((f.permalink && shown.has(f.permalink)) || shownTitleDay.has(`${f.title}|${f.date}`))
  )));
}
