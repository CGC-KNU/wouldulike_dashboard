import { requireTool } from "./guard";
import { defaultRange, kstToday, parseDay, parseRange, rangeLabel, RANGE_UNITS, type RangeUnit } from "./appRange";
import { renderKeyReport } from "./appKeyReport";
import { errorBody, page, rangeBar, rangeFilename, type ReportKind } from "./appRangePage";
import { renderRawReport, seriesCsv } from "./appRawReport";
import { buildAppSeries } from "./appSeries";

/**
 * `/r/app/raw`(지표 원본) · `/r/app/key`(주요 지표)가 같이 쓰는 처리 — 권한 · 기간 읽기 · 칸 세기 · 그리기.
 *
 * 둘 다 내부 전용이다 — 로그인한 담당자(매장 권한)만 본다. 기간이 잘못됐거나 못 읽었을 때도 위 띠(기간 폼)는 그대로 둬서
 * 그 자리에서 고쳐 다시 뽑게 한다.
 */

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "private, no-store",
};

const TITLE: Record<ReportKind, string> = { raw: "앱 지표 원본", key: "앱 주요 지표" };

export async function rangeReportResponse(req: Request, kind: ReportKind): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const today = kstToday();
  // 폼에는 받은 값을 그대로 다시 채운다 — 못 읽은 값만 기본값으로
  const fallback = defaultRange(today);
  const unit = (RANGE_UNITS as string[]).includes(q.get("unit") ?? "") ? (q.get("unit") as RangeUnit) : fallback.unit;
  const form = { start: parseDay(q.get("start")) ?? fallback.start, end: parseDay(q.get("end")) ?? fallback.end, unit };
  const errorPage = (status: number, title: string, detail: string) =>
    new Response(
      page({ title: TITLE[kind], css: "", bar: rangeBar({ kind, form, today, status: null, filename: TITLE[kind] }), body: errorBody(title, detail) }),
      { status, headers: HEADERS }
    );

  const deny = await requireTool("restaurants");
  // requireTool 은 JSON 을 돌려준다 — 브라우저로 여는 화면이라 같은 뜻을 HTML 로
  if (deny) {
    // 503 = 로그인 확인 중 백엔드가 못 답했다(Koyeb 잠듦, guard.ts) — 로그인 문제가 아니다
    if (deny.status === 503) return errorPage(503, "백엔드가 깨어나는 중입니다.", "몇 초 뒤 새로고침해 주세요. 한동안 아무도 안 쓰면 서버가 잠들어 첫 요청이 늦습니다.");
    return errorPage(deny.status, deny.status === 403 ? "이 보고서를 볼 권한이 없습니다." : "로그인이 필요합니다.", "Probe 에 로그인한 뒤 다시 열어 주세요.");
  }

  const parsed = parseRange({ start: q.get("start"), end: q.get("end"), unit: q.get("unit") }, today);
  if (!parsed.ok) return errorPage(400, "이 기간으로는 뽑지 못했습니다.", parsed.error);
  const spec = parsed.spec;

  let series;
  try {
    series = await buildAppSeries(spec);
  } catch (e) {
    console.error(`[r/app/${kind}] 보고서 생성 실패`, e);
    return errorPage(503, "보고서를 만들지 못했습니다.", e instanceof Error ? e.message : "알 수 없는 오류");
  }

  const filename = rangeFilename(kind, spec);
  if (kind === "raw" && q.get("format") === "csv") {
    return new Response(seriesCsv(series), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="app-metrics.csv"; filename*=UTF-8''${encodeURIComponent(filename)}.csv`,
        "X-Robots-Tag": "noindex, nofollow",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const status = `${rangeLabel(spec)}${series.warnings.length ? ` · 주의 ${series.warnings.length}건` : ""}`;
  const bar = rangeBar({ kind, form: { start: spec.start, end: spec.end, unit: spec.unit }, today, status, filename });
  return new Response(kind === "raw" ? renderRawReport(series, bar) : renderKeyReport(series, bar), { headers: HEADERS });
}
