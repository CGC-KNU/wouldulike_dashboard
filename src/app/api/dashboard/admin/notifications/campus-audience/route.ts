import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// 대학가별 푸시 수신 가능 회원 수 — 대학가 한정 알림을 예약하기 전에 대상 규모를 본다.
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value ?? "";
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/admin/notifications/campus-audience/`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  return NextResponse.json(await res.json().catch(() => []), { status: res.status });
}
