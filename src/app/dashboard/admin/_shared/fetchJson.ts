"use client";

/**
 * 런처가 읽는 원자료용 fetch.
 *
 * 0919 저녁 런처가 "파트너 매장 0곳 · 이번 주 0건"으로 떴다 — Astro 탭에는 29곳이 있는데.
 * 네트워크 탭을 보니 훅 셋(현황·이번 주·Polaris)이 같은 주소를 겹쳐 부르고 있었다: stores ×4,
 * leads ×3, invoices ×3, insights ×3 — 한 번에 스무 개 남짓. 백엔드(Koyeb 작은 인스턴스)가 그걸
 * 다 받아 주지 못해 뒤쪽 요청이 503 으로 돌아왔고, null 을 받은 훅이 빈 배열로 그려 **0 처럼 보였다**.
 *
 * 그래서 여기서 셋을 한다:
 *   1. 같은 주소가 날아가는 중이면 그 약속을 같이 쓴다 (in-flight dedupe). 30초 안의 결과는 다시 쓴다.
 *   2. 동시에 3개까지만 보낸다. 나머지는 줄을 선다 — 백엔드가 숨 쉴 틈.
 *   3. 25초까지 기다리고, 5xx·타임아웃이면 3초 뒤 한 번 더. 그래도 못 읽으면 null.
 * null 을 받은 쪽은 0 이 아니라 "읽지 못함"으로 그린다.
 */
const CACHE_MS = 30000;
/** 실패도 잠깐은 기억한다 — 401·503 이 0.1초 만에 돌아오면 다음 훅이 곧바로 같은 주소를 또 찌른다 (0919 실측). */
const FAIL_CACHE_MS = 5000;
const MAX_INFLIGHT = 3;

const inflight = new Map<string, Promise<unknown>>();
const cache = new Map<string, { at: number; value: unknown }>();
let running = 0;
const queue: (() => void)[] = [];

function slot(): Promise<void> {
  if (running < MAX_INFLIGHT) { running++; return Promise.resolve(); }
  return new Promise((res) => queue.push(() => { running++; res(); }));
}
function release() {
  running--;
  queue.shift()?.();
}

async function once(url: string, timeout: number, retries: number): Promise<unknown> {
  let left = retries;
  for (;;) {
    await slot();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      if (r.ok) return await r.json();
      // 4xx 는 다시 해도 같다. 5xx·타임아웃만 재시도.
      if (r.status < 500) return null;
    } catch { /* 타임아웃·네트워크 */ }
    finally { release(); }
    if (left-- <= 0) return null;
    await new Promise((res) => setTimeout(res, 3000));
  }
}

export function fetchJson<T = unknown>(url: string, opts: { timeout?: number; retries?: number; fresh?: boolean } = {}): Promise<T | null> {
  if (!opts.fresh) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < (hit.value === null ? FAIL_CACHE_MS : CACHE_MS)) return Promise.resolve(hit.value as T | null);
    const going = inflight.get(url);
    if (going) return going as Promise<T | null>;
  }
  const p = once(url, opts.timeout ?? 25000, opts.retries ?? 1).then((v) => {
    cache.set(url, { at: Date.now(), value: v });
    inflight.delete(url);
    return v as T | null;
  });
  inflight.set(url, p);
  return p;
}
