import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("access_token")?.value ?? "";
}

export async function GET(req: NextRequest) {
  const token = await getToken();
  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/satellite/plans/duplicate-check/${qs ? `?${qs}` : ""}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  return NextResponse.json(await res.json(), { status: res.status });
}
