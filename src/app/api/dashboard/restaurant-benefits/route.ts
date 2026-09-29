import { NextRequest, NextResponse } from "next/server";
import { wrongStore } from "@/lib/onboard/storeGuard";
import { cookies } from "next/headers";

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("access_token")?.value ?? "";
}

export async function GET(req: NextRequest) {
  const token = await getToken();
  const rid = req.nextUrl.searchParams.get("rid");
  const mismatch = wrongStore(token, rid); // 0929: 점주 토큰은 ?rid 를 무시하므로, 다른 매장이면 여기서 막는다
  if (mismatch) return mismatch;
  const kind = req.nextUrl.searchParams.get("kind");
  const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/restaurant-benefits/`);
  if (rid) url.searchParams.set("restaurant_id", rid);
  if (kind) url.searchParams.set("kind", kind);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest) {
  const token = await getToken();
  const rid = req.nextUrl.searchParams.get("rid");
  const mismatch = wrongStore(token, rid); // 0929: 점주 토큰은 ?rid 를 무시하므로, 다른 매장이면 여기서 막는다
  if (mismatch) return mismatch;
  const body = await req.json();
  if (rid) body.restaurant_id = rid;
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/restaurant-benefits/`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  return NextResponse.json(await res.json(), { status: res.status });
}
