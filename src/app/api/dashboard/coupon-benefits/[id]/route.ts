import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("access_token")?.value ?? "";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken();
  const { id } = await params;
  const rid = req.nextUrl.searchParams.get("rid");
  const body = await req.json();
  if (rid) body.restaurant_id = rid;
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/coupon-benefits/${id}/`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken();
  const { id } = await params;
  const rid = req.nextUrl.searchParams.get("rid");
  const url = new URL(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/coupon-benefits/${id}/`
  );
  if (rid) url.searchParams.set("restaurant_id", rid);
  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await res.json(), { status: res.status });
}
