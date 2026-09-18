"use client";

/**
 * 런처가 읽는 원자료용 fetch.
 *
 * 0919 저녁 런처가 "파트너 매장 0곳 · 이번 주 0건"으로 떴다 — Astro 탭에는 29곳이 있는데.
 * 원인은 8초 타임아웃: 백엔드(Koyeb)가 식어 있으면 첫 요청이 8초를 넘기고, 그때 null 을 받은
 * 훅이 빈 배열로 그려 **0 처럼 보였다**. 0 과 모름은 다르다.
 *
 * 그래서 (1) 25초까지 기다리고 (2) 한 번 실패하면 3초 뒤 한 번 더 찌른다 — 두 번째는 보통 깨어 있다.
 * 그래도 못 읽으면 null 을 돌려주고, 부르는 쪽이 "읽지 못함"으로 그린다.
 */
export async function fetchJson<T = unknown>(url: string, opts: { timeout?: number; retries?: number } = {}): Promise<T | null> {
  const timeout = opts.timeout ?? 25000;
  let left = opts.retries ?? 1;
  for (;;) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      if (r.ok) return (await r.json()) as T;
      // 4xx 는 다시 해도 같다. 5xx·타임아웃만 재시도.
      if (r.status < 500) return null;
    } catch { /* 타임아웃·네트워크 */ }
    if (left-- <= 0) return null;
    await new Promise((res) => setTimeout(res, 3000));
  }
}
