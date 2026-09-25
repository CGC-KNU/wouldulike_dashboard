import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { phoneMatches, tempPinFor, verifyOnboardToken } from "@/lib/onboard/token";

/**
 * 카카오 로그인 뒤 — 토큰 안의 임시 PIN 으로 백엔드 `verify-owner` 를 통과시켜 점주 세션을 만든다.
 * 점주는 PIN 을 입력하지 않는다. 기존 `/api/auth/verify-owner` 와 같은 백엔드 경로를 쓰고 쿠키 모양도 같다.
 *
 * 왜 이렇게 하나: 백엔드는 "카카오 계정 + 매장 PIN" 으로만 OwnerProfile 을 만든다. 우리가 발급 시 심어 둔
 * 임시 PIN 을 여기서 대신 넣어 주면, 백엔드 코드를 건드리지 않고 새 매장 첫 로그인이 된다.
 * 점주는 [0]단계에서 바로 자기 PIN 으로 바꾼다 → 이 토큰은 더 이상 세션을 못 만든다 (1회성).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const v = verifyOnboardToken(token);
  if (!v.ok) return NextResponse.json({ success: false, message: `링크가 유효하지 않습니다 (${v.reason}).` }, { status: 400 });
  const p = v.payload;

  /**
   * **신원 확인이 세션보다 먼저다** (0925 전수 점검).
   *
   * 전에는 카카오 로그인만 하면 여기서 바로 점주 세션이 만들어지고, 번호 대조는 [0]단계에서야
   * 걸렸다. 그런데 그때는 이미 `OwnerProfile` 이 생긴 뒤다 — 카톡으로 링크를 전달받은 사람이
   * 아무 카카오 계정으로나 그 매장의 점주가 되고, 나중에 [0]에서 막혀도 **그 프로필은 남는다.**
   * 대시보드·손님 데이터·혜택·PIN 변경이 그 사람에게 열린 채로.
   *
   * 카카오 로그인은 "카카오 계정을 가진 누군가" 만 증명한다. 그 사람이 사장님인지는 우리가
   * 미팅에서 받아 둔 번호로만 안다. 그러니 그 대조를 **프로필이 생기기 전에** 한다.
   *
   * 번호를 못 받아 둔 링크(`ph` 없음)는 대조할 근거가 없어 그대로 통과한다 — 그런 링크는
   * 애초에 발급 화면에서 번호를 넣어 만드는 게 맞다.
   */
  const body = (await req.json().catch(() => ({}))) as { phone?: string };
  if (p.ph && !phoneMatches(p, body.phone ?? "")) {
    return NextResponse.json({
      success: false, phone_mismatch: true,
      message: "미팅 때 알려주신 번호와 다릅니다. 그 번호로 적어 주시거나, 번호가 바뀌셨으면 담당자에게 말씀해 주세요.",
    }, { status: 409 });
  }

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
