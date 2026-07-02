import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value ?? "";
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/admin/banner-popup/s3-scan/`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
