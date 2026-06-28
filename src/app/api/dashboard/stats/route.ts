import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value ?? "";
  const rid = req.nextUrl.searchParams.get("rid");

  const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/stats/`);
  if (rid) url.searchParams.set("restaurant_id", rid);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
