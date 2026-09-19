import { cookies } from "next/headers";
import { readDraft } from "@/lib/draft/store";
import { fillReportTemplate } from "@/lib/draft/reportTemplate";
import type { StoreReport } from "@/lib/draft/types";

/**
 * 점주가 카톡으로 받아 여는 **매장 리포트** — 로그인 없음.
 *
 * 화면은 마케팅팀 매장 성과 리포트 양식(v0.9)이다. 서버는 스냅샷을 양식 JSON 으로 바꿔 끼운 HTML 한 장을 그대로 준다 —
 * 폰 스크롤·인쇄·파일 저장이 양식 원래 동작 그대로다(리액트 페이지나 iframe 에 싸지 않는다).
 *
 * 그리는 값은 전부 스냅샷이다(라이브 조회 없음 — 인증도 없고 수치도 변한다).
 * 링크 발급(LINKED)·발송(SENT)된 리포트만 열린다. 초안·승인 상태는 로그인한 담당자만 `/r/preview-<id>` 로 본다.
 *   ?print=1     미리보기에서 인쇄창(PDF 저장)을 바로 연다
 *   ?download=1  미리보기에서 HTML 파일 한 장으로 내려받는다(열람 기록 스크립트·미리보기 띠 없음)
 */

const seed = (): StoreReport[] => [];
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://wouldulike-dashboard.vercel.app";

async function load(token: string): Promise<{ r: StoreReport; preview: boolean } | null> {
  if (!/^[0-9a-f]{40}$/.test(token)) {
    if (token.startsWith("preview-")) {
      const has = (await cookies()).get("access_token")?.value;
      if (!has) return null;
      const r = readDraft<StoreReport[]>("probe_reports", seed).find((x) => x.id === token.slice(8));
      return r ? { r, preview: true } : null;
    }
    return null;
  }
  const r = readDraft<StoreReport[]>("probe_reports", seed).find((x) => x.token === token);
  if (!r) return null;
  if (r.status === "REVOKED") return { r, preview: false };
  if (r.status !== "LINKED" && r.status !== "SENT") return null;
  return { r, preview: false };
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
  const img = s.post.cover_url ?? new URL("/brand/appicon.png", SITE).toString();
  return [
    `<meta name="robots" content="noindex,nofollow">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${esc(`${s.store.name} 인스타그램 홍보 성과`)}">`,
    `<meta property="og:description" content="${esc(r.summary)}">`,
    `<meta property="og:image" content="${esc(img)}">`,
    `<meta name="description" content="${esc(r.summary)}">`,
  ].join("\n");
}

/** 담당자 미리보기 띠 — 인쇄에는 안 나온다 */
function previewBar(r: StoreReport, token: string): string {
  const btn = "display:inline-block;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;text-decoration:none";
  return (
    `<div data-preview-bar style="background:#FFF7E6;border-bottom:1px solid #F3D9A4;padding:8px 16px;display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;font:600 12px/1.4 -apple-system,sans-serif;color:#9A6414">` +
    `<span>미리보기 · ${r.status === "LINKED" || r.status === "SENT" ? "발행됨" : "아직 발행 전"}</span>` +
    `<a href="javascript:window.print()" style="${btn};background:#312E81;color:#fff">PDF</a>` +
    `<a href="/r/${esc(token)}?download=1" style="${btn};background:#fff;color:#312E81;border:1px solid #C7CCFB">HTML 파일</a>` +
    `</div><style>@media print{[data-preview-bar]{display:none!important}}</style>`
  );
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const hit = await load(token);
  if (!hit) return plain(404, "리포트를 찾을 수 없습니다.", "링크가 맞는지 확인해 주세요.");
  const { r, preview } = hit;
  if (r.status === "REVOKED" && !preview) return plain(410, "이 리포트는 더 이상 공개되지 않습니다.", "새 리포트를 받으셨다면 그 링크로 열어 주세요.");

  const q = new URL(req.url).searchParams;
  const fname = `${r.snapshot.store.name}_매장리포트_${r.snapshot.as_of.slice(0, 10).replace(/-/g, "")}`;

  // 파일로 내려받기 — 양식은 원래 한 파일로 보내도록 만들어졌다
  if (preview && q.get("download") === "1") {
    return new Response(fillReportTemplate(r), {
      headers: { ...HEADERS, "Content-Disposition": `attachment; filename="report.html"; filename*=UTF-8''${encodeURIComponent(fname)}.html` },
    });
  }

  let html = fillReportTemplate(r, { beaconToken: preview ? undefined : r.token ?? undefined });
  html = html.replace("</head>", `${headTags(r)}\n</head>`);
  if (preview) {
    html = html.replace(/<body([^>]*)>/, (m) => `${m}\n${previewBar(r, token)}`);
    if (q.get("print") === "1") html = html.replace("</body>", `<script>setTimeout(function(){document.title=${JSON.stringify(fname).replace(/</g, "\\u003c")};window.print()},600)</script>\n</body>`);
  }
  return new Response(html, { headers: HEADERS });
}
