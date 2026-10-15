import { NextResponse } from "next/server";
import { readLastEventDate } from "@/lib/bigquery/appMetrics";
import { buildMonthlyAppReport, buildWeeklyAppReport, lastCompleteMonth, monthWindow } from "@/lib/draft/appReport";
import { appReportFilename, dash, lastCompleteWeekEnd, normalizeWeekEnd, weekLabel } from "@/lib/draft/appReportData";
import { botReportData } from "@/lib/draft/appReportBot";
import { kstToday, rangeQuery } from "@/lib/draft/appRange";
import { renderKeyReport } from "@/lib/draft/appKeyReport";
import { buildAppSeries } from "@/lib/draft/appSeries";
import { slackLines, slackMessage, slackRange, SLACK_MONTHS, SLACK_WEEKS } from "@/lib/draft/appSlackReport";
import { backendWithCronToken, checkCronToken, plausibleCronToken } from "@/lib/draft/cronAuth";

/**
 * PROBE 가 #sat-probe 에 올릴 앱 지표 보고서 — **크론 전용** (0927).
 *
 * 로그인한 사람 없이 X-CRON-TOKEN 으로 연다. GitHub Actions 가 부르고, 받은 HTML 을 파일로 올리고 message 를 본문으로 쓴다.
 * 슬랙에 올리는 건 여기가 아니라 워크플로다 — 슬랙 토큰을 Vercel 에 두지 않으려고.
 *
 * 1015: 첨부를 **주요 지표 보고서**(`/r/app/key` 와 같은 그래프)로, 본문을 그 KPI 여섯 줄로 바꿨다(민찬).
 * 주간은 그 주까지 12주 · 월간은 그 달까지 6개월. `format=data`(슬랙에서 Probe 에게 물을 때)는 예전 보고서 그대로다
 * — 퍼널·주의점까지 담겨 있어 대답 재료로 쓴다(백엔드 probe/slack_brain.py).
 *
 * GET /api/probe/app-report/cron                     마지막으로 다 끝난 주
 * GET /api/probe/app-report/cron?week=2026-09-20      그 날이 속한 주
 * GET /api/probe/app-report/cron?type=monthly         마지막으로 다 끝난 달
 * GET /api/probe/app-report/cron?type=monthly&month=2026-08
 * GET /api/probe/app-report/cron?check=1&week=2026-09-27   GA4 가 그 주 끝까지 들어왔나만 — { ready, through, end }
 * GET /api/probe/app-report/cron?check=1&type=monthly&month=2026-09   월간은 말일까지 들어왔나
 * GET /api/probe/app-report/cron?format=data&week=…                 HTML 없이 숫자·퍼널·주의점만 — 슬랙에서 Probe 에게 물을 때(백엔드 probe/slack_brain.py)
 *
 * `check=1` 은 보고서를 만들지 않고 GA4 확정 테이블 목록만 본다(쿼리 한 번). 월요일 정오 워크플로가 일요일
 * 데이터가 올 때까지 15분마다 부른다 — 보고서를 매번 만들면 BigQuery 쿼리 스무 개씩이다.
 *
 * 워크플로는 `status` 가 ok 이고 본문 여섯 줄 중 숫자가 하나라도 있을 때만 보낸다.
 *
 * **토큰 판정은 백엔드가 한다**(cronAuth.ts, 0928). 대시보드는 비밀 값을 들고 있지 않고, 받은 X-CRON-TOKEN 을
 * 백엔드에 한 번 보여 준 뒤 그대로 들고 백엔드를 읽는다(app-stats · app-stats/period · metric-snapshots,
 * 백엔드 #75 · #78). Vercel 에 CRON_SECRET_TOKEN 을 넣지 않아도 된다.
 */

/** 칸(12주 · 6개월)마다 BigQuery 를 부른다 — /r/app/key 와 같은 여유. 처음 뽑는 기간은 10초 남짓(1015 실측) */
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
    // 주간은 그 주 일요일, 월간은 말일까지. 1015 에 주요 지표 보고서로 바꾸며 쓰기 퍼널이 빠져
    // 「말일 + 7일」을 기다릴 까닭이 없어졌다 — 월간 게시도 9일에서 2일로 당겼다(민찬).
    const until = monthly ? monthWindow(month!).end : end!;
    const through = await readLastEventDate().catch(() => null);
    return NextResponse.json({ ready: through !== null && through >= until, through, end: dash(until) }, { headers: { "Cache-Control": "no-store" } });
  }

  const type = monthly ? "monthly" : "weekly";

  // 슬랙에서 Probe 에게 물을 때 — 예전 보고서의 숫자·퍼널·주의점(대답 재료)
  if (q.get("format") === "data") {
    let built;
    try {
      built = monthly ? await buildMonthlyAppReport({ period: month, fetchJson: withCron }) : await buildWeeklyAppReport({ end, fetchJson: withCron });
    } catch (e) {
      console.error("[probe/app-report/cron] 보고서 생성 실패", e);
      return NextResponse.json({ detail: e instanceof Error ? e.message : "보고서를 만들지 못했습니다." }, { status: 503 });
    }
    return NextResponse.json(
      {
        type, label: built.week.label, range: { start: dash(built.week.start), end: dash(built.week.end) },
        ready: built.through !== null && built.through >= built.week.end, through: built.through,
        warnings: built.warnings, data: botReportData(built.data),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // ── #sat-probe 게시 — 주요 지표 보고서
  const last = await readLastEventDate().catch(() => null);
  // 주를 비우면 GA4 마지막 테이블 기준 마지막으로 다 끝난 주 — 워크플로는 늘 적어서 부른다(지난주를 또 보내지 않게)
  const target = monthly ? month ?? lastCompleteMonth() : end ?? (last ? lastCompleteWeekEnd(last) : null);
  if (!target) return NextResponse.json({ detail: "GA4 확정 테이블을 읽지 못해 어느 주를 뽑을지 정할 수 없습니다 (GCP_SA_KEY 확인)." }, { status: 503 });
  const parsed = slackRange(type, target, kstToday());
  if (!parsed.ok) return NextResponse.json({ detail: parsed.error }, { status: 400 });
  const spec = parsed.spec;

  let series;
  try {
    series = await buildAppSeries(spec, { fetchJson: withCron });
  } catch (e) {
    console.error("[probe/app-report/cron] 보고서 생성 실패", e);
    return NextResponse.json({ detail: e instanceof Error ? e.message : "보고서를 만들지 못했습니다." }, { status: 503 });
  }

  // 그 주(달) = 마지막 칸
  const focus = spec.buckets.length - 1;
  const bucket = spec.buckets[focus];
  const range = { start: dash(bucket.start), end: dash(bucket.end) };
  const label = monthly ? `${+target.slice(0, 4)}년 ${+target.slice(5, 7)}월` : weekLabel(target);
  const ready = series.through !== null && series.through >= bucket.end;
  const lines = slackLines(series, ready);
  const html = renderKeyReport(series, "", {
    chip: `Probe · 최근 ${monthly ? `${SLACK_MONTHS}개월` : `${SLACK_WEEKS}주`}`,
    title: `앱 지표 ${monthly ? "월간" : "주간"} 보고서 · ${label}`,
    focus,
  });
  const link = `${new URL(req.url).origin}/r/app/key?${rangeQuery(spec)}`;
  return NextResponse.json(
    {
      type,
      label,
      range,
      filename: `${monthly ? `앱지표_월간보고서_${target}` : appReportFilename(target)}.html`,
      // 예전 양식의 발송 전 검사 자리 — 주요 지표 보고서는 빈 칸을 이유와 함께 그리므로 늘 ok. 숫자가 모두 비었는지는 워크플로가 summary 로 본다
      status: "ok",
      ready,
      through: series.through,
      warnings: series.warnings,
      summary: lines.map((l) => ({ key: l.key, label: l.label, value: l.value })),
      message: slackMessage({ type, label, range, lines, ready, through: series.through, warnings: series.warnings, link }),
      html,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
