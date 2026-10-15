import { rangeReportResponse } from "@/lib/draft/appRangeRoute";

/**
 * Probe · **앱 주요 지표 보고서** — 중요한 지표만 그래프로(민찬 1015). 「지표 원본」과 같은 칸을 읽는다.
 *
 * GET /r/app/key                                        최근 12주 · 주 단위
 * GET /r/app/key?start=2026-09-01&end=2026-10-12&unit=week
 *
 * 내부 전용 — 로그인한 담당자(매장 권한)만 본다. 처리는 appRangeRoute.ts.
 */

// 칸마다 BigQuery 를 부른다 — 처음 뽑는 기간은 10초 남짓(1015 실측), 긴 기간은 넉넉히
export const maxDuration = 60;

export function GET(req: Request) {
  return rangeReportResponse(req, "key");
}
