import { NextResponse } from "next/server";

export async function GET() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/config/categories/`, {
    cache: "no-store",
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
