import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isPreview } from "@/lib/draft/previewStores";

/**
 * 미리보기 모드(`ASTRO_PREVIEW=1`)에서는 백엔드 계정 없이도 화면을 돌려볼 수 있게
 * 전권 관리자를 흉내 낸다. **운영에서는 절대 켜지 않는다** — 이 플래그가 없으면
 * 아래 코드는 실행되지 않고 예전과 똑같이 백엔드가 최종 판정한다.
 */
const PREVIEW_ME = {
  username: "preview",
  display_name: "미리보기",
  department: "SUPERADMIN",
  department_label: "슈퍼관리자",
  satellite_role: "LEAD",
  is_superadmin: true,
  is_admin: true,
  is_marketing: true,
  account_id: null,
  kakao_id: null,
  permissions: {
    can_restaurants: true,
    can_content: true,
    can_marketing: true,
    can_satellite: true,
  },
};

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value ?? "";

  if (process.env.NEXT_PUBLIC_API_URL) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/admin/me/`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      // 백엔드가 '거부'(401/403)한 건 백엔드가 없는 것과 다르다 — 미리보기로 승격하지 않는다.
      if (res.ok || res.status === 401 || res.status === 403 || !isPreview()) {
        return NextResponse.json(await res.json(), { status: res.status });
      }
    } catch (e) {
      if (!isPreview()) {
        return NextResponse.json(
          { detail: `백엔드에 연결하지 못했습니다: ${(e as Error).message}` },
          { status: 502 }
        );
      }
    }
  }

  if (isPreview()) return NextResponse.json(PREVIEW_ME);
  return NextResponse.json({ detail: "백엔드 URL이 설정되지 않았습니다." }, { status: 502 });
}
