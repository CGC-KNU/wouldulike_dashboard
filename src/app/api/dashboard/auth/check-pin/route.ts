import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * 이 PIN 이 맞는지만 물어본다 — **값은 오지 않는다** (0925).
 *
 * PIN 을 해시로 저장하면서 되읽는 길을 없앴다. 그런데 "메모에 적힌 번호가 실제와 같은가",
 * "지금 걸린 게 우리가 심은 임시 PIN 인가" 같은 **비교**는 여전히 필요하다.
 * 값을 돌려주는 대신 비교를 서버에 맡긴다. 관리자만 부를 수 있고, 무차별 시도 잠금은
 * 다른 PIN 경로와 같은 것을 쓴다 (백엔드 CheckPinView).
 */
export async function POST(req: NextRequest) {
  const token = (await cookies()).get("access_token")?.value ?? "";
  const rid = req.nextUrl.searchParams.get("rid");

  const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/auth/check-pin/`);
  if (rid) url.searchParams.set("restaurant_id", rid);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(await req.json().catch(() => ({}))),
    cache: "no-store",
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
