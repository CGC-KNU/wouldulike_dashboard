import { curationIntro, isAutoSummary, josa, ownerParagraphs, ownerProposalText, stripMarker } from "./report";
import { isEmbedded } from "./coverImage";
import type { StoreReport } from "./types";

/**
 * Probe 리포트 스냅샷 → 매장 성과 리포트 양식(v0.9)의 `report-data` JSON.
 *
 * 양식이 계산·문장·숨김을 다 한다. 여기서는 **스냅샷에 실제로 있는 원본 숫자만** 옮긴다 — 없는 칸은 비워서
 * 양식이 그 줄·카드를 숨기게 둔다(양식 규칙: 추정 금지).
 *
 * 수치·지난 보고는 백엔드 report-data(스냅샷의 `report_data`)를 그대로 옮긴다 — 같은 시점(D+7/D+14)끼리만 비교한다.
 * 그게 없는 스냅샷(0919 이전 · 성과 권한 없음)은 스냅샷 수치만 쓰고 나머지 칸은 비운다.
 *
 * 우리 계정 비교값(직전 5건 평균 · 중앙값 · 순위 · 게시물 수)은 **넣지 않는다**. 점주가 궁금한 건 우리 채널 안에서의
 * 순위가 아니라 가게가 얼마나 알려졌는지고, 이 JSON 은 리포트 HTML 에 그대로 실려 화면에서 숨겨도 소스 보기로 보인다
 * (0925 마케팅 피드백). 비교는 Probe 내부 화면에서만 본다.
 *
 * 문장도 같다. 0925 이전에 만든 리포트에는 "우리 채널이 평소 올리는 게시물 N건의 가운데 값보다…" 가 박혀 있고,
 * 링크는 열 때마다 여기서 새로 그리므로 **그릴 때** 갈아 끼운다 — 옛 자동 문장은 지금 규칙의 문장으로, 없앤 제안(P2·P4)은 빼고.
 * 사람이 고친 문장은 그대로 둔다.
 *
 * 아직 못 채우는 것: 앱에서 가게 화면을 연 수(앱 카드) — 앱이 사용자 ID 를 안 보내 DB 와 이을 수 없다.
 */

type Json = Record<string, unknown>;

/** ISO → KST 날짜 "YYYY-MM-DD" */
function kstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 캡션은 앞부분만 — 양식이 뒤에 "… 본문 더보기" 를 붙인다 */
function excerpt(c: string | null): string | null {
  if (!c) return null;
  const lines = c.split("\n").slice(0, 4).join("\n");
  return lines.length > 160 ? `${lines.slice(0, 160).trimEnd()}…` : lines;
}

/**
 * 바깥 이미지는 **우리 출처의 /api/img** 로 돌린다.
 * 메타 CDN 은 브라우저가 직접 부르면 막고 서버가 부르면 준다 — 그래서 화면에 보이려면 프록시를 거쳐야 하고,
 * 저장(바이트 읽기)까지 되려면 그 프록시가 **지금 보고 있는 도메인**이어야 한다(다른 출처면 CORS 로 막힌다).
 * `origin` 이 없으면(화면에서 필수값만 볼 때) 원본을 그대로 둔다 — 그 경로는 이미지를 그리지 않는다.
 */
const PROXY_HOSTS = [".cdninstagram.com", ".fbcdn.net", ".amazonaws.com"];
function viaProxy(url: string, origin?: string): string {
  if (!url || !origin || url.startsWith("data:")) return url;
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return url;
    host = u.hostname;
  } catch {
    return url;
  }
  if (!PROXY_HOSTS.some((s) => host.endsWith(s))) return url;
  return `${origin.replace(/\/$/, "")}/api/img?u=${encodeURIComponent(url)}`;
}

/**
 * 리포트 숫자가 며칠차 · 어느 날 값인가 — report-data 가 말해 준다. 없으면 예전 규칙(D+7 이 있으면 7일차, 아니면 누적).
 * 양식과 편집 화면 「스냅샷」 머리(1005)가 같이 쓴다.
 */
export function measuredPoint(s: StoreReport["snapshot"]): { day: number | null; date: string } {
  const rd = s.report_data?.available ? s.report_data : null;
  const posted = rd?.post?.posted_at ?? (s.post.posted_at ? kstDate(s.post.posted_at) : null);
  const d7 = s.basis === "D7";
  return { day: rd?.day ?? (d7 ? 7 : s.age_days), date: rd?.measured_at ?? (d7 && posted ? addDays(posted, 7) : kstDate(s.as_of)) };
}

export function toTemplateData(r: StoreReport, opts: { origin?: string } = {}): Json {
  const s = r.snapshot;
  const rd = s.report_data?.available ? s.report_data : null;
  const val = (k: string) => rd?.metrics?.[k as keyof NonNullable<typeof rd.metrics>] ?? s.metrics.find((m) => m.key === k)?.value ?? null;
  const posted = rd?.post?.posted_at ?? (s.post.posted_at ? kstDate(s.post.posted_at) : null);

  const { day, date: measured } = measuredPoint(s);

  const multi = s.post.co_stores > 1;
  // 큐레이션에 함께 실린 가게 수 — 사람이 적은 값(1003)이 먼저. 제목에서 센 수(co_stores)는 제목에 이름이 적힌 제휴 매장만 센다.
  const storeCount = s.manual?.store_count ?? s.post.co_stores;
  const proposals = r.proposals.filter((p) => p.approved)
    .map((p) => { const t = ownerProposalText(p, s); return t ? `**${p.title}** ${t}` : null; })
    .filter((t): t is string => t !== null);
  // 해석 문단(0928 ownerStory) — 자동으로 들어갔던 문장은 지금 규칙의 글로, 사람이 고친 문장은 그대로
  const paragraphs = ownerParagraphs(r.interpretation, s);
  // 큐레이션 소개 문단(1002)이 글에 들어가 있으면 「N곳을 함께 소개한 큐레이션입니다」를 또 붙이지 않는다 — 같은 말이다
  const intro = curationIntro(s);
  const introShown = intro !== null && paragraphs.includes(intro);
  // 자동 요약은 카톡 미리보기용이다 — 카드 제목으로는 사람이 직접 쓴 요약만 올린다
  const headline = isAutoSummary(r.summary, s) ? null : r.summary;

  return {
    store: { name: s.store.name },
    account: { handle: "@w_ouldulike", name: "우주라이크", avatar: "" },
    post: {
      title: stripMarker(s.post.topic),
      type_label: multi ? "큐레이션" : null,
      format: s.post.format === "reel" ? "reels" : "feed",
      posted_at: posted,
      duration_sec: rd?.post?.duration_sec ?? null,
      permalink: rd?.post?.permalink ?? s.post.permalink,
      // 게시물 사진: 인스타 썸네일(메타) 우선, 없으면 기획 커버
      // 스냅샷에 파일째 담긴 그림이 있으면 **그게 1순위**다 — 만료도 CORS 도 없다.
      // 없으면(옛 스냅샷) 예전처럼 주소를 쓰되, 바깥 주소는 우리 출처의 프록시를 거친다.
      image: isEmbedded(s.post.cover_url)
        ? (s.post.cover_url as string)
        : viaProxy(rd?.post?.thumb_url || s.post.cover_url || "", opts.origin),
      caption: excerpt(s.post.caption),
      // 양식은 이 둘로 「혼자 받은 숫자가 아닙니다」 문단을 붙인다 — 소개 문단이 이미 말했으면 붙이지 않게 끈다
      store_count: multi && !introShown ? storeCount : null,
      multi_store: multi && !introShown,
    },
    report: { day, measured_at: measured },
    metrics: {
      views: val("views"), reach: val("reach"), saved: val("saved"), shares: val("shares"), likes: val("likes"), comments: val("comments"),
      profile_visits: val("profile_visits"), follows: val("follows"), avg_watch_sec: typeof rd?.metrics?.avg_watch_ms === "number" ? Math.round(rd.metrics.avg_watch_ms / 100) / 10 : null,
      interactions: val("total_interactions"),
    },
    app: { store_views: null },
    /**
     * 「시간이 지나며 쌓인 숫자」 — 1일 · 7일 · 14일 중 **찍혀 있는 것만**.
     *
     * 남의 게시물과 비교하지 않고 성장을 말하는 유일한 칸이다(0925 방향). 없는 점은
     * 백엔드가 아예 안 보내고, 여기서도 채우지 않는다 — 0 을 넣으면 「줄었다」로 읽힌다.
     * 양식은 **두 점 이상일 때만** 그린다(점 하나는 추이가 아니다).
     *
     * 옛 게시물은 D+1 이 비어 있을 수 있다. 정밀 추적은 「N일이 막 지난 게시물」만 잡아
     * 소급이 안 된다 — 그런 편은 7일·14일 두 점으로 그려진다.
     */
    series: (rd?.series ?? []).map((p) => ({
      day: p.day,
      measured_at: p.measured_at,
      reach: p.reach ?? null,
      views: p.views ?? null,
      // 1002: 추이의 두 번째 막대 — 반응 수(total_interactions, 없으면 좋아요·저장·공유·댓글이 다 있을 때 합)
      interactions: p.total_interactions ?? ([p.likes, p.saved, p.shares, p.comments].every((v) => typeof v === "number")
        ? (p.likes as number) + (p.saved as number) + (p.shares as number) + (p.comments as number) : null),
    })),
    // 지난 보고(7일차) 값 — 14일차 보고일 때만 온다. 양식은 앱 카드의 "지난 보고에서 N회 더" 문장에만 쓴다(표는 0925 에 뺐다)
    previous: rd?.previous ?? null,
    // 비워 두면 양식이 「다른 게시물과 비교」·「솔직하게」 카드를 통째로 숨긴다 — 위 머리말 참고
    benchmarks: {},
    notes: {},
    insight: {
      headline,
      paragraphs: [...paragraphs, ...proposals],
      // 여러 가게를 함께 실은 편이면 양식이 "이번 도달은 {store} 혼자 받은 숫자가 아닙니다" 를 붙인다.
      // 큐레이션이라는 사실은 그대로 밝히되, 약점으로 말하지 않는다(0925).
      limitation: multi && !introShown
        ? `이번 편은 「${stripMarker(s.post.topic)}」 주제로 ${storeCount}곳을 함께 소개한 큐레이션입니다. ${josa(s.store.name, "이", "가")} 추천 가게 중 한 곳으로 실렸습니다.`
        : null,
    },
    upsell: { enabled: false },
    contact: { url: "" },
  };
}

/**
 * 양식이 "보내기 전에 채워야 할 값"으로 막는 필드 — 양식 스크립트의 필수 목록과 같다.
 * 비어 있으면 점주 화면 맨 위에 빨간 칸이 뜨므로, 승인 전에 서버에서 먼저 막는다.
 */
const REQUIRED = ["store.name", "post.title", "post.format", "post.posted_at", "post.permalink", "report.day", "report.measured_at",
  "metrics.views", "metrics.reach", "metrics.saved", "metrics.shares", "metrics.likes", "metrics.comments"] as const;
const REQUIRED_LABEL: Record<(typeof REQUIRED)[number], string> = {
  "store.name": "매장 이름", "post.title": "게시물 제목", "post.format": "게시물 형식", "post.posted_at": "게시일", "post.permalink": "인스타그램 링크",
  "report.day": "며칠차 측정인지", "report.measured_at": "측정일", "metrics.views": "조회수", "metrics.reach": "도달", "metrics.saved": "저장",
  "metrics.shares": "공유", "metrics.likes": "좋아요", "metrics.comments": "댓글",
};
export function templateMissing(r: StoreReport): string[] {
  const d = toTemplateData(r);
  const get = (path: string) => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Json)[k] : undefined), d);
  return REQUIRED.filter((k) => { const v = get(k); return v === null || v === undefined || v === ""; }).map((k) => REQUIRED_LABEL[k]);
}
