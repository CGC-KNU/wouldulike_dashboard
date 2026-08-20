import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * 1단계(카카오)를 통과한 상태인지만 알려준다.
 *
 * pending_kakao_id 는 httpOnly 라 클라이언트 JS 가 직접 못 읽는다.
 * 값을 내려주면 위조 여지가 생기므로 **존재 여부만** 응답한다 —
 * 2단계 화면이 "카카오부터 하세요"로 되돌려보낼 판단에는 그것으로 충분하다.
 */
export async function GET() {
  const cookieStore = await cookies();
  const pending = cookieStore.get("pending_kakao_id")?.value;
  return NextResponse.json({ ready: !!pending });
}
