import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value ?? "";
  const search = req.nextUrl.searchParams.get("search") ?? "";

  const url = new URL(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/restaurants/`
  );
  if (search) url.searchParams.set("search", search);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
