import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearBackendCache } from "@/lib/draft/toolProxy";

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("access_token")?.value ?? "";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken();
  const body = await req.json();

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/admin/restaurants/${id}/`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );
  const data = await res.json();
  // 매장 본체가 바뀌었으면 목록 캐시(6초)를 비운다 — 안 그러면 제휴를 껐는데
  // 화면이 한동안 옛 값을 본다. 상태 배지와 목록이 따로 노는 원인이었다 (0914).
  if (res.ok) clearBackendCache();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken();
  const body = await req.json().catch(() => ({}));

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/admin/restaurants/${id}/`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );
  const data = await res.json();
  if (res.ok) clearBackendCache();
  return NextResponse.json(data, { status: res.status });
}
