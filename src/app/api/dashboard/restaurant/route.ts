import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("access_token")?.value ?? "";
}

export async function GET(req: NextRequest) {
  const token = await getToken();
  const rid = req.nextUrl.searchParams.get("rid");

  const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/restaurant/`);
  if (rid) url.searchParams.set("restaurant_id", rid);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(req: NextRequest) {
  const token = await getToken();
  const rid = req.nextUrl.searchParams.get("rid");
  const body = await req.json();

  const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/restaurant/`);
  if (rid) url.searchParams.set("restaurant_id", rid);

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
