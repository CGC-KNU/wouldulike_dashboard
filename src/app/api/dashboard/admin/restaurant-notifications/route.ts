import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("access_token")?.value ?? "";
}

const BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/admin/restaurant-notifications/`;

export async function GET(req: NextRequest) {
  const token = await getToken();
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const res = await fetch(`${BASE}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
