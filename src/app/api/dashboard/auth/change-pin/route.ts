import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value ?? "";
  const rid = req.nextUrl.searchParams.get("rid");

  const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/auth/change-pin/`);
  if (rid) url.searchParams.set("restaurant_id", rid);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(await req.json()),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
