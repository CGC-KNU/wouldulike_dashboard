import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyOnboardToken } from "@/lib/onboard/token";

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
    body: JSON.stringify({ restaurant_id: p.rid, pin: p.tp }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; access?: string; refresh?: string; message?: string };

  if (!res.ok || !data.success || !data.access) {
    // 임시 PIN 이 이미 바뀌었으면(=온보딩을 한 번 지나갔으면) 여기서 막힌다. 의도된 1회성이다.
    return NextResponse.json({ success: false, message: data.message ?? "이 링크로는 더 이상 로그인할 수 없습니다. 이미 등록을 마치셨다면 점주 대시보드로 로그인해 주세요.", used: res.status === 400 }, { status: 400 });
  }

  const secure = process.env.NODE_ENV === "production";
  jar.set("access_token", data.access, { httpOnly: true, secure, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  if (data.refresh) jar.set("refresh_token", data.refresh, { httpOnly: true, secure, sameSite: "lax", maxAge: 60 * 60 * 24 * 90 });
  jar.delete("pending_token");
  jar.delete("onboard_return");
  return NextResponse.json({ success: true });
}
