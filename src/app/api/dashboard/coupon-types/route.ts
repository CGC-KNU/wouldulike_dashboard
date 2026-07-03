import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("access_token")?.value ?? "";
}

export async function GET(req: NextRequest) {
  const token = await getToken();
  const rid = req.nextUrl.searchParams.get("rid");
  const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/coupon-types/`);
  if (rid) url.searchParams.set("restaurant_id", rid);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
