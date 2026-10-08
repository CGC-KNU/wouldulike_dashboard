import { AsyncLocalStorage } from "node:async_hooks";

/**
 * 사람 없이 도는 호출(14일차 자동 초안)이 백엔드를 부를 때 쓰는 토큰 (1007).
 *
 * 평소 백엔드 호출은 로그인한 사람의 `access_token` 쿠키를 들고 간다. 크론에는 쿠키가 없어서, 백엔드가
 * 크론 토큰을 받고 내준 15분짜리 `cron_scoped` 토큰(백엔드 `POST /api/probe/auto-token/`)을 이 요청 안에서만 쓴다.
 * AsyncLocalStorage 라서 같은 서버에서 동시에 도는 다른 사람의 요청에는 새지 않는다.
 */
const store = new AsyncLocalStorage<string>();

export function withServiceToken<T>(token: string, fn: () => Promise<T>): Promise<T> {
  return store.run(token, fn);
}

/** 이 요청이 서비스 토큰 안에서 도는 중이면 그 토큰, 아니면 undefined */
export function serviceToken(): string | undefined {
  return store.getStore();
}

/** 백엔드에서 자동 초안용 토큰을 받는다. 실패하면 null — 크론 토큰이 틀렸거나 백엔드가 아직 이 길을 모른다. */
export async function mintServiceToken(base: string | undefined, cronToken: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!base) return null;
  try {
    const res = await fetchImpl(`${base}/api/probe/auto-token/`, { method: "POST", headers: { "X-CRON-TOKEN": cronToken }, cache: "no-store" });
    if (!res.ok) return null;
    const d = (await res.json()) as { access?: string };
    return typeof d.access === "string" && d.access ? d.access : null;
  } catch {
    return null;
  }
}
