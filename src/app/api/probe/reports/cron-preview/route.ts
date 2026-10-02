import { NextResponse } from "next/server";
import { checkCronToken, plausibleCronToken } from "@/lib/draft/cronAuth";
import { DOWNLOADABLE, originOf, reportFilename, reportPageHtml, reportPermalink } from "@/lib/draft/reportPage";
import { getReportAsCron, ReportStoreError } from "@/lib/draft/reportStore";

/**
 * PROBE 가 #ops-partner 에 올릴 매장 리포트 미리보기 — **크론 전용** (민찬 0928).
 *
 * GET /api/probe/reports/cron-preview?id=rep-…   Header: X-CRON-TOKEN
 *
 * 담당자 미리보기(`/r/preview-<id>`)와 **같은 HTML**(reportPageHtml)을 준다 — 위 띠의 파일 받기 스크립트까지.
 * GitHub Actions 러너가 크롬으로 이 HTML 을 열고, 담당자가 누르는 그 함수(`window.__reportFiles`)로 PNG·HTML 을
 * 만든다. 그래서 #ops-partner 에 올라간 파일이 사장님께 간 파일과 같다.
 *
 * 토큰 판정은 백엔드가 한다(cronAuth.ts). 승인 전 리포트는 409 — 파일 받기 띠가 잠겨 있다.
 * 파일 이름(확장자 없음)은 `X-Report-Filename` 헤더(URL 인코딩)로 같이 준다.
 * 인스타 게시물 주소는 `X-Report-Permalink` 헤더(URL 인코딩, 없으면 빈 값) — 초안 승인 메시지에 링크로 붙인다.
 */

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export async function GET(req: Request) {
  const token = req.headers.get("x-cron-token");
  if (!plausibleCronToken(token)) return NextResponse.json({ detail: "크론 토큰이 맞지 않습니다." }, { status: 403 });
  const check = await checkCronToken(process.env.NEXT_PUBLIC_API_URL, token, todayKst());
  if (check === "denied") return NextResponse.json({ detail: "크론 토큰이 맞지 않습니다." }, { status: 403 });
  if (check === "unreachable") return NextResponse.json({ detail: "백엔드에 토큰을 확인하지 못했습니다 — 백엔드가 떠 있는지 보세요." }, { status: 502 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!ID_RE.test(id)) return NextResponse.json({ detail: "id 가 필요합니다." }, { status: 400 });

  let r;
  try {
    r = await getReportAsCron(id, token);
  } catch (e) {
    const status = e instanceof ReportStoreError ? e.status : 502;
    return NextResponse.json({ detail: e instanceof Error ? e.message : "리포트를 읽지 못했습니다." }, { status });
  }
  if (!r) return NextResponse.json({ detail: "리포트를 찾을 수 없습니다." }, { status: 404 });
  if (!DOWNLOADABLE.includes(r.status)) return NextResponse.json({ detail: `승인 전 리포트입니다(${r.status}).` }, { status: 409 });

  return new Response(reportPageHtml(r, { origin: originOf(req), preview: true }), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Report-Filename": encodeURIComponent(reportFilename(r)),
      "X-Report-Permalink": encodeURIComponent(reportPermalink(r) ?? ""),
    },
  });
}
