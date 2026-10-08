import { NextResponse } from "next/server";

/**
 * 지금 떠 있는 배포가 무엇인가 (1008). 세틀라이트 데스크톱 앱이 이걸 주기적으로 보고,
 * 열어 둔 창의 배포와 다르면 새로고침한다 — 배포 뒤 옛 화면 코드로 계속 쓰다 깨지는 일을 막는다.
 * 값은 Vercel 이 넣어 주는 환경 변수뿐이라 로그인 없이 열어 둬도 된다(공개 저장소의 커밋 번호).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7), deployment: process.env.VERCEL_DEPLOYMENT_ID ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
