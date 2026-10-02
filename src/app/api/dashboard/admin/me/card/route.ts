import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * 내 디지털 명함 — 백엔드 `/api/dashboard/admin/me/card/` 를 그대로 잇는다 (1002).
 * 휴대폰·메일이 들어가서 값은 전부 백엔드(AdminConfig)에 있다. 이 레포는 공개라 여기엔 아무 값도 두지 않는다.
 * 슈퍼관리자는 ?username= 으로 다른 사람 명함을 채울 수 있다(백엔드가 판정).
 */
async function forward(req: NextRequest, method: "GET" | "PATCH") {
  const token = (await cookies()).get("access_token")?.value ?? "";
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return NextResponse.json({ detail: "백엔드 URL이 설정되지 않았습니다." }, { status: 502 });
  const url = new URL(`${base}/api/dashboard/admin/me/card/`);
  const who = req.nextUrl.searchParams.get("username");
  if (who) url.searchParams.set("username", who);
  try {
    const res = await fetch(url.toString(), {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(method === "PATCH" ? { "Content-Type": "application/json" } : {}) },
      body: method === "PATCH" ? await req.text() : undefined,
      cache: "no-store",
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch (e) {
    return NextResponse.json({ detail: `백엔드에 연결하지 못했습니다: ${(e as Error).message}` }, { status: 502 });
  }
}

export const GET = (req: NextRequest) => forward(req, "GET");
export const PATCH = (req: NextRequest) => forward(req, "PATCH");
