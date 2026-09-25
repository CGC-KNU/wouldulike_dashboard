import { cookies } from "next/headers";
import { requireTool } from "@/lib/draft/guard";
import { getReport, getReportByToken } from "@/lib/draft/reportStore";
import { fillReportTemplate, insertAfterBody } from "@/lib/draft/reportTemplate";
import { toTemplateData } from "@/lib/draft/reportTemplateData";
import { downloadBar } from "@/lib/draft/reportDownload";
import type { StoreReport } from "@/lib/draft/types";

/**
 * 점주가 카톡으로 받아 여는 **매장 리포트** — 로그인 없음.
 *
 * 화면은 마케팅팀 매장 성과 리포트 양식(v0.9)이다. 서버는 스냅샷을 양식 JSON 으로 바꿔 끼운 HTML 한 장을 그대로 준다 —
 * 폰 스크롤·인쇄·파일 저장이 양식 원래 동작 그대로다(리액트 페이지나 iframe 에 싸지 않는다).
 *
 * 그리는 값은 전부 스냅샷이다(라이브 조회 없음 — 인증도 없고 수치도 변한다).
 * 링크 발급(LINKED)·발송(SENT)된 리포트만 열린다. 초안·승인 상태는 로그인한 담당자만 `/r/preview-<id>` 로 본다.
 * 미리보기 위 띠에서 사장님께 카톡으로 보낼 파일(PNG · 스크립트 없는 HTML · 인쇄)을 받는다 — reportDownload.ts.
 * 승인된 리포트만. `?print=1` 이면 인쇄창을 바로 연다.
 */

// 0925: 기본값이 vercel 주소였다. 주소를 app.wouldulike.kr 하나로 모았으니 여기도 그쪽이다 —
// 환경변수가 비면 **사장님께 나가는 리포트 링크**가 이 값을 쓴다.
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.wouldulike.kr";

/**
 * **요청이 들어온 그 출처.** 리포트 안 이미지는 이 출처의 `/api/img` 를 거쳐야 한다.
 *
 * 고정값(NEXT_PUBLIC_SITE_URL·vercel 기본값)으로 짚으면 안 된다 — 운영은 app.wouldulike.kr 인데
 * 그 값이 비어 있어 vercel 주소를 가리켰고, 이미지가 **다른 출처**가 되어 저장이 통째로 실패했다(0923).
 * 프록시 앞에 붙는 출처는 언제나 지금 보고 있는 도메인이어야 한다.
 */
function originOf(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  try {
    return new URL(req.url).origin;
  } catch {
    return SITE;
  }
}

async function load(token: string): Promise<{ r: StoreReport; preview: boolean } | null> {
  if (!/^[0-9a-f]{40}$/.test(token)) {
    if (token.startsWith("preview-")) {
      /**
       * 0925: 여기가 **쿠키가 있는지만** 봤다. 그런데 그 쿠키는 점주도 손님도 들고 있다
       * (lib/draft/guard.ts 머리말). 게다가 리포트 id 는 `rep-<시각>` 이라 추측이 된다 —
       * 사장님 한 분이 로그인만 하면 **남의 매장 미승인 초안**을 열 수 있었다.
       *
       * 초안은 우리끼리 보는 것이다. 담당자 권한을 확인한다.
       * (승인·발송된 리포트는 아래 40자 토큰 경로로 열리고, 그쪽은 저장소가 범위를 지킨다.)
       */
      const deny = await requireTool("restaurants");
      if (deny) return null;
      const r = await getReport(token.slice(8)).catch(() => null);
      return r ? { r, preview: true } : null;
    }
    return null;
  }
  // 저장소가 공개 범위를 지킨다 — LINKED·SENT 는 본문, REVOKED 는 상태만, 그 외는 없음
  const r = await getReportByToken(token).catch(() => null);
  return r ? { r, preview: false } : null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const HEADERS = { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "private, no-store" };

function plain(status: number, title: string, body: string): Response {
  return new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>우주라이크 매장 리포트</title></head>` +
      `<body style="margin:0;background:#F1F2F7;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;word-break:keep-all">` +
      `<div style="max-width:520px;margin:60px auto;padding:48px 24px;background:#fff;border-radius:16px;text-align:center">` +
      `<p style="font-size:15px;font-weight:600;color:#191F28;margin:0">${title}</p><p style="font-size:13px;color:#8B95A1;margin:8px 0 0">${body}</p></div></body></html>`,
    { status, headers: HEADERS }
  );
}

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

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const hit = await load(token);
  if (!hit) return plain(404, "리포트를 찾을 수 없습니다.", "링크가 맞는지 확인해 주세요.");
  const { r, preview } = hit;
  if (r.status === "REVOKED" && !preview) return plain(410, "이 리포트는 더 이상 공개되지 않습니다.", "새 리포트를 받으셨다면 그 링크로 열어 주세요.");

  let html = fillReportTemplate(r, { beaconToken: preview ? undefined : r.token ?? undefined, origin: originOf(req) });
  html = html.replace("</head>", `${headTags(r)}\n</head>`);
  if (preview) {
    const day = toTemplateData(r).report as { day: number | null; measured_at: string };
    const fname = `${r.snapshot.store.name}_성과리포트${day.day != null ? `_${day.day}일차` : ""}_${day.measured_at.replace(/-/g, "")}`.replace(/[\\/:*?"<>|\s]+/g, "_");
    const canDownload = r.status === "APPROVED" || r.status === "LINKED" || r.status === "SENT";
    const label = r.status === "SENT" ? "보냄" : canDownload ? "승인됨" : "승인 전";
    html = insertAfterBody(html, downloadBar({ filename: fname, canDownload, statusLabel: label }));
  }
  return new Response(html, { headers: HEADERS });
}
