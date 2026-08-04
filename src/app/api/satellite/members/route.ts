import { NextResponse } from "next/server";
import { cookies } from "next/headers";

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("access_token")?.value ?? "";
}

export async function GET() {
  const token = await getToken();
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/satellite/members/`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
