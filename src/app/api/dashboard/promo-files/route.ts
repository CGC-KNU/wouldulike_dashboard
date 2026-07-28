import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value ?? "";
  const rid = req.nextUrl.searchParams.get("restaurant_id");

  const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/promo-files/`);
  if (rid) url.searchParams.set("restaurant_id", rid);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
