import { NextRequest, NextResponse } from "next/server";
import { wrongStore } from "@/lib/onboard/storeGuard";
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
  const mismatch = wrongStore(token, rid); // 0929: 점주 토큰은 ?rid 를 무시하므로, 다른 매장이면 여기서 막는다
  if (mismatch) return mismatch;
  const body = await req.json();
  if (rid) body.restaurant_id = rid;
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/restaurant-benefits/${id}/`,
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
  const mismatch = wrongStore(token, rid); // 0929: 점주 토큰은 ?rid 를 무시하므로, 다른 매장이면 여기서 막는다
  if (mismatch) return mismatch;
  const url = new URL(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/restaurant-benefits/${id}/`
  );
  if (rid) url.searchParams.set("restaurant_id", rid);
  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await res.json(), { status: res.status });
}
