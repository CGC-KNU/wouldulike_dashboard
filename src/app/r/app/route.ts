import { requireTool } from "@/lib/draft/guard";
import { buildMonthlyAppReport, buildWeeklyAppReport } from "@/lib/draft/appReport";
import { fillAppReportTemplate, normalizeWeekEnd, weekRangeLabel, APP_BODY_TAG } from "@/lib/draft/appReportData";
import { insertAfterBody } from "@/lib/draft/reportTemplate";
import { downloadBar } from "@/lib/draft/reportDownload";

/**
 * Probe · 앱 지표 **주간 보고서** — 화면의 「주간 보고서 만들기」가 여는 곳.
 *
 * 매장 리포트(`/r/<token>`)와 달리 **내부 전용**이다. 점주에게 나가지 않으므로 공개 토큰·열람 비콘이 없고,
 * 로그인한 담당자(매장 권한)만 본다. 위 띠에서 PNG·HTML·인쇄로 받아 슬랙·문서에 붙인다 — reportDownload.ts.
 *
 * GET /r/app                      마지막으로 다 끝난 주(월~일)
 * GET /r/app?week=2026-09-20       그 날이 속한 주 (아무 요일이나 줘도 그 주 일요일로 맞춘다)
 * GET /r/app?type=monthly          마지막으로 다 끝난 달
 * GET /r/app?type=monthly&month=2026-08   그 달
 *
 * 월간은 DB 칸을 백엔드 월별 스냅샷에서 읽어 **전월 대비**를 붙인다. 스냅샷이 없는 달은 그 칸을 비운 채로
 * 낸다 — 0 이 아니다. 창이 한 달이라 DAU/WAU 가 아니라 DAU/MAU 이고, 양식 각주도 type 으로 갈린다.
 *
 * 정적 구간이라 같은 폴더의 `/r/[token]` 보다 먼저 잡힌다. 예전에도 `/r/app` 은 토큰 모양이 아니라 404 였다.
 */

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "private, no-store",
};

function plain(status: number, title: string, body: string): Response {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>우주라이크 앱 지표 보고서</title></head>` +
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

  const q = new URL(req.url).searchParams;
  const monthly = q.get("type") === "monthly";

  let end: string | undefined;
  if (!monthly) {
    const raw = q.get("week");
    if (raw) {
      const norm = normalizeWeekEnd(raw);
      if (!norm) return plain(400, "week 값을 읽지 못했습니다.", `"${raw}" — YYYY-MM-DD 로 주세요. 그 날이 속한 주를 냅니다.`);
      end = norm;
    }
  }
  const month = q.get("month") ?? undefined;
  if (monthly && month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return plain(400, "month 값을 읽지 못했습니다.", `"${month}" — YYYY-MM 으로 주세요.`);
  }

  let built;
  try {
    built = monthly ? await buildMonthlyAppReport({ period: month }) : await buildWeeklyAppReport({ end });
  } catch (e) {
    console.error("[r/app] 주간 보고서 생성 실패", e);
    return plain(503, "보고서를 만들지 못했습니다.", e instanceof Error ? e.message : "알 수 없는 오류");
  }

  const html = insertAfterBody(
    fillAppReportTemplate(built.data),
    downloadBar({
      filename: built.filename,
      canDownload: true,
      statusLabel: `${built.week.label}${monthly ? "" : ` · ${weekRangeLabel(built.week.start, built.week.end)}`}${built.warnings.length ? ` · 주의 ${built.warnings.length}건` : ""}`,
    }),
    APP_BODY_TAG
  );
  return new Response(html, { headers: HEADERS });
}
