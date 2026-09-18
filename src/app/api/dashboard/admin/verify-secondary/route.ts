import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * 2차 비밀번호 확인 — 백엔드로 그대로 넘긴다.
 *
 * **무슨 일이 있어도 JSON 을 돌려준다.** 예전엔 백엔드가 500(HTML)을 내면 여기서
 * `res.json()` 이 터져 이 라우트까지 HTML 500 이 됐고, 화면은 '확인 중' 에서 영원히
 * 멈췄다 (민열님 0918). 사람은 "왜 안 되지" 만 남는다.
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value ?? "";
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/admin/verify-secondary/`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(await req.json()),
      }
    );
    const raw = await res.text();
    try {
      return NextResponse.json(JSON.parse(raw), { status: res.status });
    } catch {
      // 백엔드가 JSON 이 아닌 걸 줬다 — 그 사실을 그대로 말한다
      return NextResponse.json(
        { valid: false, detail: `서버 오류 (${res.status}). 잠시 뒤 다시 시도해 주세요.` },
        { status: res.status >= 400 ? res.status : 502 }
      );
    }
  } catch {
    return NextResponse.json({ valid: false, detail: "백엔드에 연결하지 못했습니다." }, { status: 502 });
  }
}
