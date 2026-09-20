import { NextRequest, NextResponse } from "next/server";
import { recordReportView } from "@/lib/draft/reportStore";

/**
 * 열람 비콘 — 공개 페이지가 클라이언트에서 한 번 보낸다.
 * 서버 렌더에서 세지 않는 이유: 카톡에 링크를 붙이는 순간 미리보기 크롤러가 GET 을 때려 조회수가 1이 된다.
 * 누가 봤는지는 남기지 않는다 — 알 수도 없고 아는 척하면 안 된다.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[0-9a-f]{40}$/.test(token)) return new NextResponse(null, { status: 204 });
  await recordReportView(token);
  return new NextResponse(null, { status: 204 });
}
