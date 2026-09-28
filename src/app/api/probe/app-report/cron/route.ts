import { NextResponse } from "next/server";
import { readLastEventDate } from "@/lib/bigquery/appMetrics";
import { buildMonthlyAppReport, buildWeeklyAppReport, monthWindow } from "@/lib/draft/appReport";
import { dash, fillAppReportTemplate, normalizeWeekEnd } from "@/lib/draft/appReportData";
import { appReportMessage, appReportSummary, renderAppReportStatic } from "@/lib/draft/appReportStatic";
import { backendWithCronToken, checkCronToken, plausibleCronToken } from "@/lib/draft/cronAuth";

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
 * GET /api/probe/app-report/cron?check=1&week=2026-09-27   GA4 가 그 주 끝까지 들어왔나만 — { ready, through, end }
 *
 * `check=1` 은 보고서를 만들지 않고 GA4 확정 테이블 목록만 본다(쿼리 한 번). 월요일 정오 워크플로가 일요일
 * 데이터가 올 때까지 15분마다 부른다 — 보고서를 매번 만들면 BigQuery 쿼리 스무 개씩이다.
 *
 * 응답의 `status` 가 "error" 면 양식의 발송 전 검사에서 빠진 값이 나왔다는 뜻이다 — 워크플로는 보내지 않는다.
 *
 * **토큰 판정은 백엔드가 한다**(cronAuth.ts, 0928). 대시보드는 비밀 값을 들고 있지 않고, 받은 X-CRON-TOKEN 을
 * 백엔드에 한 번 보여 준 뒤 그대로 들고 백엔드를 읽는다(app-stats · app-stats/period · metric-snapshots,
 * 백엔드 #75 · #78). Vercel 에 CRON_SECRET_TOKEN 을 넣지 않아도 된다.
 */

/** 보고서 한 장이 BigQuery 쿼리 스무 개쯤을 때린다 — /r/app 과 같은 여유 */
export const maxDuration = 60;

/** 오늘(KST) "YYYY-MM-DD" — 토큰 확인에 쓰는 하루치 구간 */
const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export async function GET(req: Request) {
  const token = req.headers.get("x-cron-token");
  if (!plausibleCronToken(token)) return NextResponse.json({ detail: "크론 토큰이 맞지 않습니다." }, { status: 403 });
  const base = process.env.NEXT_PUBLIC_API_URL;
  const check = await checkCronToken(base, token, todayKst());
  if (check === "denied") return NextResponse.json({ detail: "크론 토큰이 맞지 않습니다." }, { status: 403 });
  if (check === "unreachable") return NextResponse.json({ detail: "백엔드에 토큰을 확인하지 못했습니다 — 백엔드가 떠 있는지 보세요." }, { status: 502 });
  const withCron = backendWithCronToken(base, token);

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

  if (q.get("check") === "1") {
    if (monthly ? !month : !end) return NextResponse.json({ detail: "check=1 은 week(주간) 또는 month(월간)를 같이 주세요." }, { status: 400 });
    const until = monthly ? monthWindow(month!).end : end!;
    const through = await readLastEventDate().catch(() => null);
    return NextResponse.json({ ready: through !== null && through >= until, through, end: dash(until) }, { headers: { "Cache-Control": "no-store" } });
  }

  let built;
  try {
    built = monthly ? await buildMonthlyAppReport({ period: month, fetchJson: withCron }) : await buildWeeklyAppReport({ end, fetchJson: withCron });
  } catch (e) {
    console.error("[probe/app-report/cron] 보고서 생성 실패", e);
    return NextResponse.json({ detail: e instanceof Error ? e.message : "보고서를 만들지 못했습니다." }, { status: 503 });
  }

  const rendered = renderAppReportStatic(fillAppReportTemplate(built.data));
  const type = monthly ? "monthly" : "weekly";
  const range = { start: dash(built.week.start), end: dash(built.week.end) };
  // 사람이 읽을 사유 — 앞은 데이터를 못 읽은 것, 뒤는 양식이 남긴 경고
  const warnings = [...built.warnings, ...rendered.warnings];
  const summary = appReportSummary(built.data);
  const ready = built.through !== null && built.through >= built.week.end;
  const origin = new URL(req.url).origin;
  const link = monthly ? `${origin}/r/app?type=monthly&month=${range.start.slice(0, 7)}` : `${origin}/r/app?week=${range.end}`;
  return NextResponse.json(
    {
      type,
      label: built.week.label,
      range,
      filename: `${built.filename}.html`,
      status: rendered.status,
      ready,
      through: built.through,
      warnings,
      summary,
      // 슬랙 본문에는 **데이터를 못 읽은 경고만** 싣는다. 양식 경고(빈 칸에 status 가 없다 등)는 만드는 쪽이 고칠
      // 일이라 읽는 사람에게는 소음이다 — 응답의 warnings 에는 남아 워크플로 로그에 찍힌다 (0928 첫 dry_run).
      message: appReportMessage({ type, label: built.week.label, range, summary, ready, through: built.through, warnings: built.warnings, link }),
      html: rendered.html,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
