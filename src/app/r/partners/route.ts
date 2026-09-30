import { requireTool } from "@/lib/draft/guard";
import { buildPartnerMonthlyReport } from "@/lib/draft/partnerReport";
import { fillPartnerTemplate, partnerMissing, PARTNER_BODY_TAG } from "@/lib/draft/partnerTemplate";
import { insertAfterBody } from "@/lib/draft/reportTemplate";
import { downloadBar } from "@/lib/draft/reportDownload";

/**
 * Probe · **제휴 가게 사장님 월간 보고서** — 모든 가게에 공통으로 나가는 한 장.
 *
 * GET /r/partners                 마지막으로 다 끝난 달
 * GET /r/partners?month=2026-09   그 달
 *
 * 가게별 숫자는 없다 — 그건 매장 리포트(`/r/<토큰>`)가 맡는다. 공통 보고서에 특정 가게
 * 숫자가 섞이면 받는 사람마다 다른 말이 된다.
 *
 * **사장님께는 PNG 로 보낸다(0928 결정).** 그래서 여기도 미리보기 띠를 붙인다 —
 * 점주에게 링크를 주지 않으므로 공개 토큰·열람 비콘이 없고, 로그인한 담당자만 연다.
 *
 * `/r/app` 과 같은 이유로 넉넉히 둔다 — BigQuery 두 번 + 백엔드 한 번을 기다린다.
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
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>우주라이크 사장님 월간 보고서</title></head>` +
      `<body style="margin:0;background:#F4F4F9;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;word-break:keep-all">` +
      `<div style="max-width:520px;margin:60px auto;padding:48px 24px;background:#fff;border-radius:16px;text-align:center">` +
      `<p style="font-size:15px;font-weight:600;color:#111827;margin:0">${esc(title)}</p>` +
      `<p style="font-size:13px;color:#6B7280;margin:8px 0 0;line-height:1.7">${esc(body)}</p></div></body></html>`,
    { status, headers: HEADERS }
  );
}

export async function GET(req: Request) {
  const deny = await requireTool("restaurants");
  // requireTool 은 JSON 을 돌려준다 — 여기는 브라우저로 여는 화면이라 같은 뜻을 HTML 로 바꿔 준다.
  if (deny) return plain(deny.status, deny.status === 403 ? "이 보고서를 볼 권한이 없습니다." : "로그인이 필요합니다.", "Probe 에 로그인한 뒤 다시 열어 주세요.");

  const month = new URL(req.url).searchParams.get("month") ?? undefined;
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return plain(400, "month 값을 읽지 못했습니다.", `"${month}" — YYYY-MM 으로 주세요.`);
  }

  let built;
  try {
    built = await buildPartnerMonthlyReport({ period: month });
  } catch (e) {
    console.error("[r/partners] 사장님 월간 보고서 생성 실패", e);
    return plain(503, "보고서를 만들지 못했습니다.", e instanceof Error ? e.message : "알 수 없는 오류");
  }

  // 숫자가 하나도 없으면 빈 종이가 나간다 — 그대로 내보내지 않고 왜인지 말한다.
  const missing = partnerMissing(built.data);
  if (missing.length) {
    return plain(503, "이대로는 보낼 수 없습니다.", `${missing.join(" · ")}${built.warnings.length ? ` — ${built.warnings.join(" ")}` : ""}`);
  }

  const html = insertAfterBody(
    fillPartnerTemplate(built.data),
    downloadBar({
      filename: built.filename,
      canDownload: true,
      statusLabel: `${built.period}${built.warnings.length ? ` · 주의 ${built.warnings.length}건` : ""}`,
    }),
    PARTNER_BODY_TAG
  );
  return new Response(html, { headers: HEADERS });
}
