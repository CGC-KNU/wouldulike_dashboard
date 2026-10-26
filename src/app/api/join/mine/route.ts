import { NextResponse } from "next/server";
import { API, joinToken } from "@/lib/join";

export async function GET() {
  const t = await joinToken();
  if (!t) return NextResponse.json({ applications: [], logged: false });
  const r = await fetch(`${API()}/api/partner/apply/mine/`, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" }).catch(() => null);
  if (!r) return NextResponse.json({ applications: [] }, { status: 503 });
  return NextResponse.json(await r.json().catch(() => ({ applications: [] })), { status: r.status });
}
