import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { tempPinFor, verifyOnboardToken } from "@/lib/onboard/token";

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

  const { new_pin } = (await req.json().catch(() => ({}))) as { new_pin?: string };
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
