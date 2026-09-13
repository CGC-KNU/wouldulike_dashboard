import { NextResponse } from "next/server";
import { isPreview } from "@/lib/draft/previewStores";

/**
 * 미리보기 진입 (`ASTRO_PREVIEW=1` 전용).
 *
 * 미들웨어가 `access_token` 쿠키를 요구하기 때문에, 백엔드 계정이 없으면 화면을 아예 못 연다.
 * 새 화면(Astro 확장·Probe·Castor)을 로컬에서 눌러보려는 사람마다 계정을 받아야 하는 건 과하다.
 *
 * 그래서 이 라우트는 **플래그가 켜져 있을 때만** 서명 없는 더미 토큰을 심고 대시보드로 보낸다.
 * 백엔드는 이 토큰을 인증하지 않으므로 실데이터는 한 줄도 나오지 않는다 —
 * 보이는 건 `previewStores.ts` 의 스냅샷과 초안 저장소뿐이다.
 *
 *   ASTRO_PREVIEW=1 npx next dev  →  http://localhost:3000/auth/preview
 *
 * 플래그가 없으면 404 를 낸다. 운영 배포에서는 존재하지 않는 것과 같다.
 */
export async function GET(req: Request) {
  if (!isPreview()) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }

  const payload = Buffer.from(
    JSON.stringify({ is_admin: true, is_marketing: true, department: "SUPERADMIN", preview: true })
  )
    .toString("base64url");

  const url = new URL(req.url);
  const to = url.searchParams.get("to") ?? "/dashboard/admin";
  const res = NextResponse.redirect(new URL(to, url.origin));
  res.cookies.set("access_token", `eyJhbGciOiJub25lIn0.${payload}.preview`, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
  });
  return res;
}
