import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("access_token")?.value ?? "";
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ code: string; benefitId: string }> }
) {
  const token = await getToken();
  const { code, benefitId } = await params;
  const rid = req.nextUrl.searchParams.get("rid");
  const url = new URL(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/coupon-types/${encodeURIComponent(code)}/benefits/${benefitId}/`
  );
  if (rid) url.searchParams.set("restaurant_id", rid);
  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await res.json(), { status: res.status });
}
