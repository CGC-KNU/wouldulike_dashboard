import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("pending_token")?.value;

  if (!token) {
    return NextResponse.json({ restaurants: [] }, { status: 401 });
  }

  const search = req.nextUrl.searchParams.get("search") ?? "";

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/restaurants/?search=${encodeURIComponent(search)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    return NextResponse.json({ restaurants: [] }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
