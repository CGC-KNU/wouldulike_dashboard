import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { phoneMatches, tempPinFor, verifyOnboardToken } from "@/lib/onboard/token";

/**
 * [0] PIN 을 점주 것으로 바꾼다.
 * 백엔드 change-pin 은 기존 PIN 이 있으면 `current_pin` 을 요구한다. 임시 PIN 은 토큰 안에만 있고 점주는 모르므로
 * 여기서 서버가 대신 채워 넣는다. 이 호출이 성공하는 순간 같은 링크로는 다시 세션을 만들 수 없다 (1회성).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const v = verifyOnboardToken(token);
  if (!v.ok) return NextResponse.json({ success: false, message: `링크가 유효하지 않습니다 (${v.reason}).` }, { status: 400 });
  const access = (await cookies()).get("access_token")?.value;
  if (!access) return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });

  const { new_pin, phone } = (await req.json().catch(() => ({}))) as { new_pin?: string; phone?: string };

  /**
   * **번호 대조** — 미팅에서 받아 둔 번호와 같아야 넘어간다.
   *
   * 카카오 로그인은 "카카오 계정을 가진 누군가"만 증명한다. 그 사람이 사장님인지는 확인하지 않는다.
   * 링크를 잘못 받은 사람이 그 매장의 계약을 체결할 수 있다는 뜻이다.
   * 알림톡 인증이 붙기 전까지의 최소 방어다 — 우리가 아는 번호를 모르면 못 넘어간다.
   * 여기서 막는 이유: 약관을 다 읽고 서명한 뒤 [2]에서 거절하면 사장님이 헛수고를 한다.
   * (consent 에서도 한 번 더 본다 — [0]을 건너뛴 세션이 있을 수 있다.)
   */
  if (!phoneMatches(v.payload, phone ?? "")) {
    return NextResponse.json({
      success: false, phone_mismatch: true,
      message: "미팅 때 알려주신 번호와 다릅니다. 그 번호로 적어 주시거나, 번호가 바뀌셨으면 담당자에게 말씀해 주세요.",
    }, { status: 409 });
  }

  if (!/^\d{4}$/.test(new_pin ?? "")) return NextResponse.json({ success: false, message: "PIN 은 숫자 4자리입니다." }, { status: 400 });
  if (/^(\d)\1{3}$/.test(new_pin!) || new_pin === "1234") return NextResponse.json({ success: false, message: "너무 쉬운 PIN 입니다. 다른 번호로 정해 주세요." }, { status: 400 });

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/auth/change-pin/?restaurant_id=${v.payload.rid}`, {
    method: "POST", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ current_pin: tempPinFor(v.payload.rid), new_pin }), cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
  if (!res.ok || data.success === false) return NextResponse.json({ success: false, message: data.message ?? "PIN 을 바꾸지 못했습니다." }, { status: res.status || 400 });
  return NextResponse.json({ success: true });
}
