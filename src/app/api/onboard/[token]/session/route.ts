import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { tempPinFor, verifyOnboardToken } from "@/lib/onboard/token";

/**
 * 카카오 로그인 뒤 — 토큰 안의 임시 PIN 으로 백엔드 `verify-owner` 를 통과시켜 점주 세션을 만든다.
 * 점주는 PIN 을 입력하지 않는다. 기존 `/api/auth/verify-owner` 와 같은 백엔드 경로를 쓰고 쿠키 모양도 같다.
 *
 * 왜 이렇게 하나: 백엔드는 "카카오 계정 + 매장 PIN" 으로만 OwnerProfile 을 만든다. 우리가 발급 시 심어 둔
 * 임시 PIN 을 여기서 대신 넣어 주면, 백엔드 코드를 건드리지 않고 새 매장 첫 로그인이 된다.
 * 점주는 [0]단계에서 바로 자기 PIN 으로 바꾼다 → 이 토큰은 더 이상 세션을 못 만든다 (1회성).
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const v = verifyOnboardToken(token);
  if (!v.ok) return NextResponse.json({ success: false, message: `링크가 유효하지 않습니다 (${v.reason}).` }, { status: 400 });
  const p = v.payload;

  const jar = await cookies();
  // 신규 카카오 사용자는 pending_token, 이미 다른 매장 점주면 access_token 을 들고 온다. 둘 다 시도한다.
  const bearer = jar.get("pending_token")?.value ?? jar.get("access_token")?.value;
  if (!bearer) return NextResponse.json({ success: false, message: "카카오 로그인이 먼저 필요합니다.", need_kakao: true }, { status: 401 });

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/auth/verify-owner/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ restaurant_id: p.rid, pin: tempPinFor(p.rid) }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; access?: string; refresh?: string; message?: string; restaurant_id?: number };

  if (!res.ok || !data.success || !data.access) {
    // 임시 PIN 이 이미 바뀌었으면(=온보딩을 한 번 지나갔으면) 여기서 막힌다. 의도된 1회성이다.
    return NextResponse.json({ success: false, message: data.message ?? "이 링크로는 더 이상 로그인할 수 없습니다. 이미 등록을 마치셨다면 점주 대시보드로 로그인해 주세요.", used: res.status === 400 }, { status: 400 });
  }

  /**
   * 받은 토큰이 **이 매장의 것인지** 확인한다.
   *
   * 0921 에는 `OwnerProfile.user` 가 OneToOne 이라, 이미 다른 매장 점주인 계정은 restaurant_id·pin 을
   * 보지도 않고 그 매장 토큰이 돌아왔다 — 그래서 "한 계정에 매장 하나"라고 안내하고 막았다.
   * 0923 에 재민이 풀었다(`dashboard/migrations/0019_owner_profile_multi_store`): 한 계정이 매장을
   * 여럿 가질 수 있고, 새 매장은 PIN 으로 인증해 붙는다. 그 안내는 이제 **사실이 아니라서** 걷어냈다.
   * 검사는 남긴다 — 다른 매장 토큰으로 이 매장 온보딩이 진행되면 안 되는 건 그대로다.
   */
  if (typeof data.restaurant_id === "number" && data.restaurant_id !== p.rid) {
    return NextResponse.json({
      success: false, wrong_store: true,
      message: "다른 매장의 로그인 정보가 돌아왔습니다. 화면을 새로고침해 다시 시도해 주시고, 계속 이러면 담당자에게 말씀해 주세요.",
    }, { status: 409 });
  }

  const secure = process.env.NODE_ENV === "production";
  jar.set("access_token", data.access, { httpOnly: true, secure, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  if (data.refresh) jar.set("refresh_token", data.refresh, { httpOnly: true, secure, sameSite: "lax", maxAge: 60 * 60 * 24 * 90 });
  jar.delete("pending_token");
  jar.delete("onboard_return");
  return NextResponse.json({ success: true });
}
