import { NextResponse } from "next/server";
import { hasCronToken } from "@/lib/draft/guard";
import { buildMonthlyAppReport, buildWeeklyAppReport, type BackendFetch } from "@/lib/draft/appReport";
import { dash, fillAppReportTemplate, normalizeWeekEnd } from "@/lib/draft/appReportData";
import { appReportSummary, renderAppReportStatic } from "@/lib/draft/appReportStatic";

/**
 * PROBE 가 #sat-probe 에 올릴 앱 지표 보고서 — **크론 전용** (0927).
 *
 * `/r/app` 과 같은 보고서를 만들되 로그인한 사람 없이 X-CRON-TOKEN 으로 연다. GitHub Actions 가 부르고,
 * 받은 HTML 을 파일로 올리고 summary 로 메시지 세 줄을 쓴다. 슬랙에 올리는 건 여기가 아니라 워크플로다
 * — 슬랙 토큰을 Vercel 에 두지 않으려고.
 *
 * GET /api/probe/app-report/cron                     마지막으로 다 끝난 주
 * GET /api/probe/app-report/cron?week=2026-09-20      그 날이 속한 주
 * GET /api/probe/app-report/cron?type=monthly         마지막으로 다 끝난 달
 * GET /api/probe/app-report/cron?type=monthly&month=2026-08
 *
 * 응답의 `status` 가 "error" 면 양식의 발송 전 검사에서 빠진 값이 나왔다는 뜻이다 — 워크플로는 보내지 않는다.
 * 백엔드는 같은 X-CRON-TOKEN 으로 읽는다(app-stats · app-stats/period · metric-snapshots, 백엔드 #75 · #78).
 */

/** 보고서 한 장이 BigQuery 쿼리 스무 개쯤을 때린다 — /r/app 과 같은 여유 */
export const maxDuration = 60;

const withCron: BackendFetch = async <T,>(path: string, search?: string): Promise<T | null> => {
  const base = process.env.NEXT_PUBLIC_API_URL;
  const token = process.env.CRON_SECRET_TOKEN;
  if (!base || !token) return null;
  try {
    const res = await fetch(`${base}${path}${search ? `?${search}` : ""}`, { headers: { "X-CRON-TOKEN": token }, cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
};

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET_TOKEN) {
    return NextResponse.json({ detail: "CRON_SECRET_TOKEN 이 설정되지 않았습니다 — Vercel 환경변수에 백엔드와 같은 값을 넣으세요." }, { status: 503 });
  }
  if (!hasCronToken(req)) return NextResponse.json({ detail: "크론 토큰이 맞지 않습니다." }, { status: 403 });

  const q = new URL(req.url).searchParams;
  const monthly = q.get("type") === "monthly";
  let end: string | undefined;
  const week = q.get("week");
  if (!monthly && week) {
    const norm = normalizeWeekEnd(week);
    if (!norm) return NextResponse.json({ detail: `week 값을 읽지 못했습니다 — "${week}". YYYY-MM-DD 로 주세요.` }, { status: 400 });
    end = norm;
  }
  const month = q.get("month") ?? undefined;
  if (monthly && month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ detail: `month 값을 읽지 못했습니다 — "${month}". YYYY-MM 으로 주세요.` }, { status: 400 });
  }

  let built;
  try {
    built = monthly ? await buildMonthlyAppReport({ period: month, fetchJson: withCron }) : await buildWeeklyAppReport({ end, fetchJson: withCron });
  } catch (e) {
    console.error("[probe/app-report/cron] 보고서 생성 실패", e);
    return NextResponse.json({ detail: e instanceof Error ? e.message : "보고서를 만들지 못했습니다." }, { status: 503 });
  }

  const rendered = renderAppReportStatic(fillAppReportTemplate(built.data));
  return NextResponse.json(
    {
      type: monthly ? "monthly" : "weekly",
      label: built.week.label,
      range: { start: dash(built.week.start), end: dash(built.week.end) },
      filename: `${built.filename}.html`,
      status: rendered.status,
      // 사람이 읽을 사유 — 앞은 데이터를 못 읽은 것, 뒤는 양식이 남긴 경고
      warnings: [...built.warnings, ...rendered.warnings],
      summary: appReportSummary(built.data),
      html: rendered.html,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
