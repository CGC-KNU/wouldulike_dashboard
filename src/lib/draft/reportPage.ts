import { fillReportTemplate, insertAfterBody } from "./reportTemplate";
import { toTemplateData } from "./reportTemplateData";
import { downloadBar } from "./reportDownload";
import type { StoreReport } from "./types";

/**
 * 매장 리포트 한 장(HTML)을 만든다 — 점주 링크(`/r/<토큰>`)·담당자 미리보기(`/r/preview-<id>`)·
 * PROBE 크론 미리보기(`/api/probe/reports/cron-preview`)가 **같은 함수**를 쓴다.
 * 크론 러너가 담당자와 다른 HTML 로 파일을 만들면 #ops-partner 에 올라간 파일과 사장님께 간 파일이 갈라진다.
 */

// 0925: 기본값이 vercel 주소였다. 주소를 app.wouldulike.kr 하나로 모았으니 여기도 그쪽이다 —
// 환경변수가 비면 **사장님께 나가는 리포트 링크**가 이 값을 쓴다.
export const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.wouldulike.kr";

/**
 * **요청이 들어온 그 출처.** 리포트 안 이미지는 이 출처의 `/api/img` 를 거쳐야 한다.
 *
 * 고정값(NEXT_PUBLIC_SITE_URL·vercel 기본값)으로 짚으면 안 된다 — 운영은 app.wouldulike.kr 인데
 * 그 값이 비어 있어 vercel 주소를 가리켰고, 이미지가 **다른 출처**가 되어 저장이 통째로 실패했다(0923).
 * 프록시 앞에 붙는 출처는 언제나 지금 보고 있는 도메인이어야 한다.
 */
export function originOf(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  try {
    return new URL(req.url).origin;
  } catch {
    return SITE;
  }
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** 카톡 미리보기 — 매장 제공 사진(게시물 커버)만. 없으면 앱 아이콘. */
function headTags(r: StoreReport): string {
  const s = r.snapshot;
  // data: 는 og:image 로 못 쓴다(카톡 미리보기가 주소를 받아 간다) — 그때는 앱 아이콘으로.
  const img = s.post.cover_url && !s.post.cover_url.startsWith("data:")
    ? s.post.cover_url
    : new URL("/brand/appicon.png", SITE).toString();
  return [
    `<meta name="robots" content="noindex,nofollow">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${esc(`${s.store.name} 인스타그램 홍보 성과`)}">`,
    `<meta property="og:description" content="${esc(r.summary)}">`,
    `<meta property="og:image" content="${esc(img)}">`,
    `<meta name="description" content="${esc(r.summary)}">`,
  ].join("\n");
}

/** 담당자가 받는 파일 이름(확장자 없음) — 미리보기 띠의 PNG·HTML 저장과 PROBE 가 올리는 파일이 같다 */
export function reportFilename(r: StoreReport): string {
  const day = toTemplateData(r).report as { day: number | null; measured_at: string };
  return `${r.snapshot.store.name}_성과리포트${day.day != null ? `_${day.day}일차` : ""}_${day.measured_at.replace(/-/g, "")}`.replace(/[\\/:*?"<>|\s]+/g, "_");
}

/**
 * 이 리포트가 다루는 인스타 게시물 주소 — 리포트 화면이 쓰는 것과 같은 우선순위(수치를 다시 읽은 report-data → 스냅샷).
 * 슬랙에 링크로 올리므로 http(s) 가 아니면 없는 것으로 본다.
 */
export function reportPermalink(r: StoreReport): string | null {
  const snap = r.snapshot;
  const rd = snap.report_data?.available ? snap.report_data : null;
  const url = (rd?.post?.permalink ?? snap.post.permalink ?? "").trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

/** 승인된 뒤의 상태 — 파일을 받을 수 있다(미리보기 띠) · PROBE 가 올릴 수 있다 */
export const DOWNLOADABLE: StoreReport["status"][] = ["APPROVED", "LINKED", "SENT"];

/**
 * 리포트 HTML. `preview` 면 위에 파일 받기 띠(reportDownload.ts)를 붙인다 — 담당자 미리보기와 PROBE 크론.
 * 점주 링크는 열람 비콘 토큰을 넣는다.
 */
export function reportPageHtml(r: StoreReport, opts: { origin: string; preview: boolean; beaconToken?: string }): string {
  let html = fillReportTemplate(r, { beaconToken: opts.preview ? undefined : opts.beaconToken, origin: opts.origin });
  html = html.replace("</head>", `${headTags(r)}\n</head>`);
  if (opts.preview) {
    const canDownload = DOWNLOADABLE.includes(r.status);
    const label = r.status === "SENT" ? "보냄" : canDownload ? "승인됨" : "승인 전";
    html = insertAfterBody(html, downloadBar({ filename: reportFilename(r), canDownload, statusLabel: label }));
  }
  return html;
}
