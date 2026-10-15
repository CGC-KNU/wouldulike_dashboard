import { rangeReportResponse } from "@/lib/draft/appRangeRoute";

/**
 * Probe · **앱 지표 보고서 원본** — 기간 × 단위 표(민찬 1015). 주간(`/r/app`)·월간(`?type=monthly`)을 대신한다.
 *
 * GET /r/app/raw                                        최근 12주 · 주 단위
 * GET /r/app/raw?start=2026-09-01&end=2026-10-12&unit=week
 * GET /r/app/raw?…&format=csv                           같은 표를 CSV 로
 *
 * 내부 전용 — 로그인한 담당자(매장 권한)만 본다. 옛 `/r/app` 은 슬랙 주간·월간 게시가 같은 양식을 쓰므로 남겨 둔다.
 * 정적 구간이라 `/r/[token]` 보다 먼저 잡힌다. 처리는 주요 지표(`/r/app/key`)와 같다 — appRangeRoute.ts.
 */

// 칸마다 BigQuery 를 부른다 — 처음 뽑는 기간은 10초 남짓(1015 실측), 긴 기간은 넉넉히
export const maxDuration = 60;

export function GET(req: Request) {
  return rangeReportResponse(req, "raw");
}
