import { NextRequest, NextResponse } from "next/server";
import { remoteGet } from "@/lib/draft/remote";

/**
 * 사장님이 고칠 수 있는 혜택 줄 목록 (0924).
 *
 * 신청 폼을 자유 입력이 아니라 **고르기**로 만들기 위한 것이다. 자유 입력이면
 * "무엇을 바꿔 달라는 건지" 가 애매해져서 우리가 되물어야 한다.
 *
 * `requireTool` 을 걸지 않는다 — 이 길은 점주도 지나간다. 누가 무엇을 볼지는 백엔드가
 * 토큰을 보고 정한다. 여기서 한 번 더 막으면 규칙이 두 곳에 생기고 반드시 어긋난다.
 */
export async function GET(req: NextRequest) {
  const r = await remoteGet<unknown>("/api/astro/partner/benefits/", req.nextUrl.searchParams.toString());
  if (!r.handled) {
    return NextResponse.json({ detail: "서버에 닿지 못해 혜택을 읽지 못했습니다." }, { status: 503 });
  }
  return NextResponse.json(r.data ?? {}, { status: r.status });
}
