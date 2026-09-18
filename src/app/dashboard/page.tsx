import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decodeJwt } from "@/lib/jwt";

interface DashboardJWT {
  is_admin?: boolean;
  /** 세틀라이트 접근 — 마케팅 계정은 is_admin 이 꺼져 있고 이것만 켜져 있다. */
  is_marketing?: boolean;
  /** 구성원 계정이면 반드시 있다. 점주 토큰에는 없다. */
  department?: string;
}

export default async function DashboardRootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  if (!token) redirect("/login");

  /**
   * 구성원이면 관리자 화면, 아니면 점주 화면 (민열님 0918).
   *
   * 두 가지가 겹쳐 **관리자로 로그인해도 점주 패널이 먼저 열렸다**.
   *
   * 1. `redirect()` 를 try 안에서 불렀다. Next 의 redirect 는 예외를 던져서 동작하는데
   *    그걸 아래 catch 가 삼켜 버려, 판정이 맞든 틀리든 마지막 줄의 점주 화면으로 갔다.
   *    **판정은 try 안에서, 이동은 밖에서** 한다.
   * 2. `is_admin` 하나만 봤다. 마케팅 계정은 권한이 `can_satellite` 뿐이라 그 값이 꺼져 있다 —
   *    아윤·윤지가 들어오면 자기 일하는 화면이 아니라 점주 화면이 열린다.
   *    점주 토큰에는 `department` 가 없으므로 셋 중 하나만 있어도 구성원이다.
   */
  let staff = false;
  try {
    const payload = decodeJwt<DashboardJWT>(token);
    staff = Boolean(payload.is_admin || payload.is_marketing || payload.department);
  } catch {
    // 못 읽은 토큰은 구성원으로 치지 않는다 — 점주 화면이 안전한 쪽이다
  }

  redirect(staff ? "/dashboard/admin" : "/dashboard/owner");
}
