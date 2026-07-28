import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("access_token")?.value ?? "";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ rid: string }> }
) {
  const { rid } = await params;
  const token = await getToken();
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/admin/promo-files/${rid}/`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ rid: string }> }
) {
  const { rid } = await params;
  const token = await getToken();
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/admin/promo-files/${rid}/`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(await req.json()),
    }
  );
  return NextResponse.json(await res.json(), { status: res.status });
}
