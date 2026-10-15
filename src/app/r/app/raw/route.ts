import { requireTool } from "@/lib/draft/guard";
import { defaultRange, kstToday, parseDay, parseRange, rangeLabel, RANGE_UNITS, type RangeUnit } from "@/lib/draft/appRange";
import { errorBody, page, rangeBar, rangeFilename } from "@/lib/draft/appRangePage";
import { renderRawReport, seriesCsv } from "@/lib/draft/appRawReport";
import { buildAppSeries } from "@/lib/draft/appSeries";

/**
 * Probe · **앱 지표 보고서 원본** — 기간 × 단위 표(민찬 1015). 주간(`/r/app`)·월간(`?type=monthly`)을 대신한다.
 *
 * GET /r/app/raw                                        최근 12주 · 주 단위
 * GET /r/app/raw?start=2026-09-01&end=2026-10-12&unit=week
 * GET /r/app/raw?…&format=csv                           같은 표를 CSV 로
 *
 * 내부 전용 — 로그인한 담당자(매장 권한)만 본다. 옛 `/r/app` 은 슬랙 주간·월간 게시가 같은 양식을 쓰므로 남겨 둔다.
 * 정적 구간이라 `/r/[token]` 보다 먼저 잡힌다.
 */

// 칸마다 BigQuery 를 부른다 — 32칸 실측 10초 남짓이지만 처음 뽑는 긴 기간은 넉넉히
export const maxDuration = 60;

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "private, no-store",
};

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const today = kstToday();
  // 폼에는 받은 값을 그대로 다시 채운다 — 못 읽은 값만 기본값으로
  const fallback = defaultRange(today);
  const unit = (RANGE_UNITS as string[]).includes(q.get("unit") ?? "") ? (q.get("unit") as RangeUnit) : fallback.unit;
  const form = { start: parseDay(q.get("start")) ?? fallback.start, end: parseDay(q.get("end")) ?? fallback.end, unit };
  const errorPage = (status: number, title: string, detail: string) =>
    new Response(
      page({ title: "앱 지표 원본", css: "", bar: rangeBar({ kind: "raw", form, today, status: null, filename: "앱지표_원본" }), body: errorBody(title, detail) }),
      { status, headers: HEADERS }
    );

  const deny = await requireTool("restaurants");
  // requireTool 은 JSON 을 돌려준다 — 브라우저로 여는 화면이라 같은 뜻을 HTML 로
  if (deny) return errorPage(deny.status, deny.status === 403 ? "이 보고서를 볼 권한이 없습니다." : "로그인이 필요합니다.", "Probe 에 로그인한 뒤 다시 열어 주세요.");

  const parsed = parseRange({ start: q.get("start"), end: q.get("end"), unit: q.get("unit") }, today);
  if (!parsed.ok) return errorPage(400, "이 기간으로는 뽑지 못했습니다.", parsed.error);
  const spec = parsed.spec;

  let series;
  try {
    series = await buildAppSeries(spec);
  } catch (e) {
    console.error("[r/app/raw] 원본 생성 실패", e);
    return errorPage(503, "보고서를 만들지 못했습니다.", e instanceof Error ? e.message : "알 수 없는 오류");
  }

  const filename = rangeFilename("raw", spec);
  if (q.get("format") === "csv") {
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
  const bar = rangeBar({ kind: "raw", form: { start: spec.start, end: spec.end, unit: spec.unit }, today, status, filename });
  return new Response(renderRawReport(series, bar), { headers: HEADERS });
}
