import { DEFAULT_SUMMARY } from "./report";
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
 * 아직 못 채우는 것: 앱에서 가게 화면을 연 수(앱 카드) — 앱이 사용자 ID 를 안 보내 DB 와 이을 수 없다.
 */

type Json = Record<string, unknown>;

/** 제목 끝 "(정든밤 포함)" 은 우리끼리의 표시라 점주에게 보이지 않는다 */
const stripMarker = (t: string) => t.replace(/\s*[(（][^()（）]*포함\s*[)）]\s*/g, " ").trim();

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

export function toTemplateData(r: StoreReport, opts: { origin?: string } = {}): Json {
  const s = r.snapshot;
  const rd = s.report_data?.available ? s.report_data : null;
  const val = (k: string) => rd?.metrics?.[k as keyof NonNullable<typeof rd.metrics>] ?? s.metrics.find((m) => m.key === k)?.value ?? null;
  const posted = rd?.post?.posted_at ?? (s.post.posted_at ? kstDate(s.post.posted_at) : null);

  // 며칠차 수치인가 — report-data 가 말해 준다. 없으면 예전 규칙(D+7 이 있으면 7일차, 아니면 누적).
  const d7 = s.basis === "D7";
  const day = rd?.day ?? (d7 ? 7 : s.age_days);
  const measured = rd?.measured_at ?? (d7 && posted ? addDays(posted, 7) : kstDate(s.as_of));

  const multi = s.post.co_stores > 1;
  const proposals = r.proposals.filter((p) => p.approved).map((p) => `**${p.title}** ${p.text}`);

  return {
    store: { name: s.store.name },
    account: { handle: "@w_ouldulike", name: "우주라이크", avatar: "" },
    post: {
      title: stripMarker(s.post.topic),
      type_label: multi ? "큐레이션" : null,
      format: s.post.format === "reel" ? "reels" : "feed",
      posted_at: posted,
      duration_sec: null,
      permalink: rd?.post?.permalink ?? s.post.permalink,
      // 게시물 사진: 인스타 썸네일(메타) 우선, 없으면 기획 커버
      // 스냅샷에 파일째 담긴 그림이 있으면 **그게 1순위**다 — 만료도 CORS 도 없다.
      // 없으면(옛 스냅샷) 예전처럼 주소를 쓰되, 바깥 주소는 우리 출처의 프록시를 거친다.
      image: isEmbedded(s.post.cover_url)
        ? (s.post.cover_url as string)
        : viaProxy(rd?.post?.thumb_url || s.post.cover_url || "", opts.origin),
      caption: excerpt(s.post.caption),
      store_count: multi ? s.post.co_stores : null,
      multi_store: multi,
    },
    report: { day, measured_at: measured },
    metrics: {
      views: val("views"), reach: val("reach"), saved: val("saved"), shares: val("shares"), likes: val("likes"), comments: val("comments"),
      profile_visits: val("profile_visits"), follows: val("follows"), avg_watch_sec: null,
      interactions: val("total_interactions"),
    },
    app: { store_views: null },
    // 지난 보고(7일차) 대비 표 — 14일차 보고일 때만 온다
    previous: rd?.previous ?? null,
    // 비워 두면 양식이 「다른 게시물과 비교」·「솔직하게」 카드를 통째로 숨긴다 — 위 머리말 참고
    benchmarks: {},
    notes: {},
    insight: {
      headline: r.summary && r.summary !== DEFAULT_SUMMARY ? r.summary : null,
      paragraphs: [...r.interpretation, ...proposals],
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
