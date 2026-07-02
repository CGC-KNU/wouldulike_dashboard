import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("access_token")?.value ?? "";
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken();
  const { id } = await params;
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/admin/trends/${id}/`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(await req.json()),
    }
  );
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken();
  const { id } = await params;
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/admin/trends/${id}/`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  return NextResponse.json(await res.json(), { status: res.status });
}
