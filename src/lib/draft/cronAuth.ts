/**
 * 크론 토큰 판정을 **백엔드에 맡긴다** (0928).
 *
 * PROBE 보고서 크론(GitHub Actions)은 X-CRON-TOKEN 을 들고 온다. 처음에는 대시보드도 같은 값을 Vercel
 * 환경변수로 들고 비교했는데, Vercel 에 값을 넣을 수 있는 사람이 따로 있어 막혔다. 백엔드(Koyeb)는 이미
 * 이 값으로 판정하고 있으므로, 받은 토큰을 그대로 백엔드에 한 번 보여 주고 200 이면 연다.
 * 비밀 값을 두는 곳이 하나 줄어드는 것도 덤이다.
 *
 * 토큰이 틀리면 BigQuery 를 건드리기 전에 끊는다 — 그래서 보고서를 만들기 **전에** 따로 묻는다.
 */

export type CronCheck = "ok" | "denied" | "unreachable";

/** 헤더 값의 겉모양만 본다. 빈 값·지나치게 긴 값은 백엔드에 물을 것도 없이 거절한다. */
export function plausibleCronToken(token: string | null | undefined): token is string {
  return typeof token === "string" && token.length > 0 && token.length <= 512;
}

/** 백엔드를 크론 토큰으로 읽는 fetch — 보고서 빌더의 `fetchJson` 자리에 넣는다. */
export function backendWithCronToken(base: string | undefined, token: string, fetchImpl: typeof fetch = fetch) {
  return async <T,>(path: string, search?: string): Promise<T | null> => {
    if (!base) return null;
    try {
      const res = await fetchImpl(`${base}${path}${search ? `?${search}` : ""}`, { headers: { "X-CRON-TOKEN": token }, cache: "no-store" });
      return res.ok ? ((await res.json()) as T) : null;
    } catch {
      return null;
    }
  };
}

/**
 * 이 토큰을 백엔드가 받아 주는가. 가장 가벼운 크론 창구(하루치 app-stats/period)에 한 번 묻는다.
 * 403 이면 denied, 백엔드가 안 닿거나 5xx 면 unreachable — 둘을 섞으면 "토큰이 틀렸다"와
 * "백엔드가 죽었다"를 구분할 수 없다.
 */
export async function checkCronToken(base: string | undefined, token: string, today: string, fetchImpl: typeof fetch = fetch): Promise<CronCheck> {
  if (!base) return "unreachable";
  try {
    const res = await fetchImpl(`${base}/api/dashboard/admin/app-stats/period/?start=${today}&end=${today}`, {
      headers: { "X-CRON-TOKEN": token },
      cache: "no-store",
    });
    if (res.ok) return "ok";
    if (res.status === 401 || res.status === 403) return "denied";
    return "unreachable";
  } catch {
    return "unreachable";
  }
}
