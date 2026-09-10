import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isPreview } from "./previewStores";

/**
 * 초안 라우트의 인가 게이트.
 *
 * 기존 `/api/dashboard/*` 는 Bearer 를 백엔드로 넘겨 백엔드가 최종 판정한다. 그런데 초안 라우트는
 * 백엔드를 거치지 않고 파일 저장소를 직접 읽고 쓴다 — 판정하는 주체가 사라진다.
 * 미들웨어는 `access_token` 쿠키의 **존재만** 보므로, 로그인한 점주·손님도 통과한다.
 *
 * 그래서 여기서 `/api/dashboard/admin/me/` 를 한 번 찔러 권한을 받아온다.
 * 같은 토큰은 60초 동안 기억한다 — 화면 하나가 라우트를 여러 번 부르기 때문이다.
 */

interface Me {
  is_admin?: boolean;
  is_superadmin?: boolean;
  permissions?: { can_restaurants?: boolean; can_satellite?: boolean };
}

type Need = "restaurants" | "admin";

const cache = new Map<string, { me: Me | null; at: number }>();
const TTL = 60_000;

async function whoami(token: string): Promise<Me | null> {
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < TTL) return hit.me;

  let me: Me | null = null;
  if (process.env.NEXT_PUBLIC_API_URL) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/admin/me/`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) me = (await res.json()) as Me;
    } catch {
      me = null;
    }
  }
  cache.set(token, { me, at: Date.now() });
  return me;
}

/** 통과하면 null, 막히면 그대로 돌려줄 응답. */
export async function requireTool(need: Need): Promise<NextResponse | null> {
  // 미리보기 모드는 백엔드가 없다는 전제라 통과시킨다 (isPreview 는 production 에서 항상 false).
  if (isPreview()) return null;

  const token = (await cookies()).get("access_token")?.value;
  if (!token) return NextResponse.json({ detail: "로그인이 필요합니다." }, { status: 401 });

  const me = await whoami(token);
  if (!me) return NextResponse.json({ detail: "로그인이 필요합니다." }, { status: 401 });

  const ok =
    need === "admin"
      ? Boolean(me.is_admin || me.is_superadmin)
      : Boolean(me.permissions?.can_restaurants || me.is_superadmin);
  if (!ok) return NextResponse.json({ detail: "이 기능에 대한 권한이 없습니다." }, { status: 403 });
  return null;
}

/** CI 가 Castor 그래프를 밀어 넣을 때 쓰는 시크릿. 사용자 토큰이 없으므로 헤더로 받는다. */
export function hasIngestToken(req: Request): boolean {
  const expected = process.env.CASTOR_INGEST_TOKEN;
  return Boolean(expected) && req.headers.get("x-castor-token") === expected;
}
