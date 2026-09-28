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
  display_name?: string;
  username?: string;
  permissions?: { can_restaurants?: boolean; can_satellite?: boolean };
}

/** `/auth/preview` 가 만든 더미 토큰인가 — payload 에 `preview:true` 가 있고 서명 자리가 "preview" 다. 실제 사용자 JWT 는 이 조건을 만족하지 않는다. */
function isPreviewToken(token: string | undefined): boolean {
  if (!token || !token.endsWith(".preview")) return false;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { preview?: boolean };
    return payload.preview === true;
  } catch {
    return false;
  }
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
  const token = (await cookies()).get("access_token")?.value;
  // 미리보기 모드 + 미리보기 토큰일 때만 통과. 배포 플랫폼 이름은 경계가 아니다 — 실제 사용자 토큰은 미리보기 모드에서도 /me 를 거친다 (0911 리뷰 ⑤).
  if (isPreview() && isPreviewToken(token)) return null;
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

/**
 * 서버가 찍는 "누가". 요청 본문의 `by` 를 믿지 않는다 (0911 리뷰 ①) — 감사 기록은 위조 가능하면 없는 것과 같다.
 * 미리보기 토큰이면 "미리보기", 백엔드를 못 읽으면 null (호출부가 본문 값을 마지막 폴백으로 쓸 수 있다).
 */
export async function actorName(): Promise<string | null> {
  const token = (await cookies()).get("access_token")?.value;
  if (!token) return null;
  if (isPreview() && isPreviewToken(token)) return "미리보기";
  const me = await whoami(token);
  return me ? me.display_name || me.username || null : null;
}

/** 관리자(승인권자)인가 — 계산서 승인·발행 주체 설정처럼 돈을 다루는 액션은 UI 가 아니라 여기서 막는다 (0911 리뷰 ②). */
export async function isAdminActor(): Promise<boolean> {
  const token = (await cookies()).get("access_token")?.value;
  if (!token) return false;
  if (isPreview() && isPreviewToken(token)) return true;
  const me = await whoami(token);
  return Boolean(me?.is_admin || me?.is_superadmin);
}
