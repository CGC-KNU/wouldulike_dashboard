import { cookies } from "next/headers";

/**
 * 백엔드(Django `astro` 앱) 우선, 없으면 초안 저장소.
 *
 * ## 왜 이 파일이 있나
 *
 * Astro 데이터는 지금까지 Next 서버 프로세스 메모리에 있었다. 배포하면 날아가고,
 * 인스턴스가 둘이면 서로 다른 값을 본다. 실제로 재현했다 — A 에서 찍은 입금이 B 에는 없고,
 * 재시작하면 후보 단계가 시트 값으로 되돌아갔다. 여러 명이 같이 쓰는 순간 틀린 걸 알아채기
 * 어려운 오류가 된다.
 *
 * 그래서 원본을 DB 로 옮긴다. 다만 **한 번에 갈아타지 않는다** — 백엔드가 아직 안 올라간
 * 동안에도 툴이 멈추면 안 되니, 404 면 조용히 초안 저장소로 떨어진다.
 * 백엔드가 올라오는 순간 코드를 고치지 않아도 그쪽이 원본이 된다.
 *
 * ## 무엇을 폴백으로 보고 무엇을 에러로 보나
 *
 * 읽기와 쓰기를 다르게 다룬다.
 *
 *   읽기 — 404·405·501(아직 없음)은 물론 5xx·연결 실패도 초안으로 떨어진다.
 *          백엔드가 아프다고 화면이 통째로 깨지면 안 된다. 대신 떨어졌다는 사실을
 *          `reason` 으로 남기고, 화면은 "임시 저장소를 보고 있다"고 말한다.
 *   쓰기 — **404·405·501 만** 폴백이다. 5xx 는 그대로 에러로 올린다.
 *          저장된 줄 알았는데 메모리에만 남는 것이 제일 위험하다.
 *
 * 401·403 은 양쪽 다 그대로 올린다 — 로그인하라고 말해야 하는 상황이다.
 */

const NOT_IMPLEMENTED = new Set([404, 405, 501]);

/** 백엔드가 올라온 뒤 폴백을 끄고 싶을 때. 미구현 응답도 그대로 에러가 된다. */
const FALLBACK_ON = process.env.DRAFT_FALLBACK !== "0";

async function authHeader(): Promise<Record<string, string>> {
  const store = await cookies();
  return { Authorization: `Bearer ${store.get("access_token")?.value ?? ""}` };
}

function url(path: string, search?: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  return `${base}${path}${search ? `?${search}` : ""}`;
}

export function backendConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_API_URL);
}

export interface RemoteResult<T> {
  /** 백엔드가 답했다. false 면 초안 저장소를 써야 한다. */
  handled: boolean;
  ok: boolean;
  status: number;
  data: T | null;
  /** 폴백으로 떨어진 이유 — 로그에만 쓴다. */
  reason?: string;
}

const MISS: RemoteResult<never> = { handled: false, ok: false, status: 0, data: null };

/**
 * 백엔드 GET. 없거나 미구현이면 `handled: false`.
 *
 * 캐시는 쓰지 않는다. 여러 명이 같이 고치는 데이터라 6초라도 묵으면
 * "방금 바꿨는데 안 보인다"가 된다. 매장 목록 같은 읽기 전용 데이터의 캐시는 toolProxy 가 따로 한다.
 */
export async function remoteGet<T>(path: string, search?: string): Promise<RemoteResult<T>> {
  if (!backendConfigured()) return MISS;
  try {
    const res = await fetch(url(path, search), { headers: await authHeader(), cache: "no-store" });
    if (res.ok) {
      const text = await res.text();
      try {
        return { handled: true, ok: true, status: res.status, data: JSON.parse(text) as T };
      } catch {
        // Django 디버그 HTML — 라우트가 없는 것으로 본다
        return FALLBACK_ON ? MISS : { handled: true, ok: false, status: 502, data: null, reason: "not-json" };
      }
    }
    if (FALLBACK_ON && NOT_IMPLEMENTED.has(res.status)) return MISS;
    // 권한 문제(401·403)는 그대로 올린다 — 로그인하라고 말해야 한다.
    if (res.status === 401 || res.status === 403) {
      return { handled: true, ok: false, status: res.status, data: await safeJson<T>(res) };
    }
    // 그 밖의 실패(5xx)는 **읽기에 한해** 초안으로 떨어진다.
    // 백엔드가 아파도 화면이 통째로 깨지지 않게. 쓰기는 아래에서 여전히 막는다.
    if (FALLBACK_ON) return { ...MISS, reason: `backend-${res.status}` };
    return { handled: true, ok: false, status: res.status, data: await safeJson<T>(res) };
  } catch {
    // 네트워크가 끊긴 것은 '미구현'이 아니다. 하지만 읽기는 초안으로라도 보여 주는 편이 낫다.
    return { ...MISS, reason: "unreachable" };
  }
}

/**
 * 백엔드 쓰기(POST · PATCH · DELETE).
 *
 * 읽기와 달리 **네트워크 오류를 초안으로 떨어뜨리지 않는다.** 저장된 줄 알았는데
 * 메모리에만 남는 것이 가장 위험하다. 백엔드가 설정돼 있는데 못 닿으면 그대로 에러를 올린다.
 */
export async function remoteSend<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<RemoteResult<T>> {
  if (!backendConfigured()) return MISS;
  try {
    const res = await fetch(url(path), {
      method,
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    // 쓰기는 '아직 없음'만 폴백이다. 5xx 를 초안으로 떨어뜨리면 저장된 줄 알았는데
    // 메모리에만 남는다 — 그게 제일 위험하다.
    if (FALLBACK_ON && NOT_IMPLEMENTED.has(res.status)) return MISS;
    if (res.status === 204) return { handled: true, ok: true, status: 204, data: null };
    return { handled: true, ok: res.ok, status: res.status, data: await safeJson<T>(res) };
  } catch {
    if (FALLBACK_ON) return MISS; // 백엔드가 아직 없는 환경(로컬 미리보기)에서는 초안으로
    return { handled: true, ok: false, status: 503, data: null, reason: "unreachable" };
  }
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
