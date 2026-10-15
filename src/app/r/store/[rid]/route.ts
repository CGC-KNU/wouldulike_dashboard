import { requireTool } from "@/lib/draft/guard";
import { buildStoreMonthlyReport, StoreReportError } from "@/lib/draft/storeMonthlyReport";
import { storeMissing } from "@/lib/draft/storeMonthly";
import { fillStoreMonthlyTemplate, STORE_MONTHLY_BODY_TAG } from "@/lib/draft/storeMonthlyTemplate";
import { insertAfterBody } from "@/lib/draft/reportTemplate";
import { downloadBar } from "@/lib/draft/reportDownload";

/**
 * Probe · **가게 하나의 사장님 월간 보고서** (1015).
 *
 * GET /r/store/<rid>                 마지막으로 다 끝난 달
 * GET /r/store/<rid>?month=2026-09   그 달
 *
 * 앱 숫자만 쓴다(쿠폰 사용 · 스탬프 · 재방문 · 단골 · 찜 · 가게 화면 열람). 인스타는 게시물 리포트(`/r/<토큰>`)가,
 * 모든 가게 공통 소식은 `/r/partners` 가 맡는다.
 *
 * **사장님께는 PNG 로 보낸다(0928 결정)** — `/r/partners` 처럼 로그인한 담당자만 열고, 미리보기 띠에서 받는다.
 * 띠에는 종이에 안 나가는 주의(못 읽은 칸 등)를 같이 띄운다. PNG 는 한 장(구획 나누기 없음).
 */
export const maxDuration = 60;

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "private, no-store",
};

function plain(status: number, title: string, body: string): Response {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>우주라이크 가게 월간 보고서</title></head>` +
      `<body style="margin:0;background:#F4F4F9;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;word-break:keep-all">` +
      `<div style="max-width:520px;margin:60px auto;padding:48px 24px;background:#fff;border-radius:16px;text-align:center">` +
      `<p style="font-size:15px;font-weight:600;color:#111827;margin:0">${esc(title)}</p>` +
      `<p style="font-size:13px;color:#6B7280;margin:8px 0 0;line-height:1.7">${esc(body)}</p></div></body></html>`,
    { status, headers: HEADERS }
  );
}

export async function GET(req: Request, { params }: { params: Promise<{ rid: string }> }) {
  const deny = await requireTool("restaurants");
  if (deny) return plain(deny.status, deny.status === 403 ? "이 보고서를 볼 권한이 없습니다." : "로그인이 필요합니다.", "Probe 에 로그인한 뒤 다시 열어 주세요.");

  const { rid: raw } = await params;
  if (!/^\d+$/.test(raw)) return plain(400, "매장 번호를 읽지 못했습니다.", `"${raw}" — 숫자로 주세요.`);
  const month = new URL(req.url).searchParams.get("month") ?? undefined;
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return plain(400, "month 값을 읽지 못했습니다.", `"${month}" — YYYY-MM 으로 주세요.`);
  }

  let built;
  try {
    built = await buildStoreMonthlyReport({ rid: Number(raw), period: month });
  } catch (e) {
    if (e instanceof StoreReportError) return plain(e.status, e.title, e.message);
    console.error("[r/store] 가게 월간 보고서 생성 실패", e);
    return plain(503, "보고서를 만들지 못했습니다.", e instanceof Error ? e.message : "알 수 없는 오류");
  }

  // 그 달 이야기가 없으면 빈 종이다 — 그대로 내보내지 않고 왜인지 말한다
  const missing = storeMissing(built.data);
  if (missing.length) {
    return plain(409, `${built.storeName} · ${built.period} 은 보낼 수 없습니다.`, `${missing.join(" · ")}${built.warnings.length ? ` — ${built.warnings.join(" ")}` : ""}`);
  }

  const html = insertAfterBody(
    fillStoreMonthlyTemplate(built.data),
    downloadBar({
      filename: built.filename,
      canDownload: true,
      // 주의는 담당자만 본다(띠는 PNG·HTML 저장에서 빠진다)
      statusLabel: `${built.storeName} · ${built.period}${built.warnings.length ? ` · 주의: ${built.warnings.join(" ")}` : ""}`,
      pages: [{ no: 1, ids: [] }],
    }),
    STORE_MONTHLY_BODY_TAG
  );
  return new Response(html, { headers: HEADERS });
}
