import { cookies } from "next/headers";
import { requireTool } from "@/lib/draft/guard";
import { getReport, getReportByToken } from "@/lib/draft/reportStore";
import { reportPageHtml, originOf } from "@/lib/draft/reportPage";
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

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const hit = await load(token);
  if (!hit) return plain(404, "리포트를 찾을 수 없습니다.", "링크가 맞는지 확인해 주세요.");
  const { r, preview } = hit;
  if (r.status === "REVOKED" && !preview) return plain(410, "이 리포트는 더 이상 공개되지 않습니다.", "새 리포트를 받으셨다면 그 링크로 열어 주세요.");

  const html = reportPageHtml(r, { origin: originOf(req), preview, beaconToken: r.token ?? undefined });
  return new Response(html, { headers: HEADERS });
}
