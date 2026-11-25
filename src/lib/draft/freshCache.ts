import { unstable_cache } from "next/cache";

/**
 * 만료된 캐시 값을 「지금 값」처럼 내주지 않는 `unstable_cache`(1125).
 *
 * `unstable_cache` 는 revalidate 가 지나면 **옛 값을 먼저 돌려주고** 뒤에서 새로 읽는다(stale-while-revalidate).
 * Probe 처럼 하루 몇 번만 여는 화면에서는 그 「먼저 돌려준 옛 값」이 곧 보이는 값이다. 1125 실측:
 *  - 「지금 앱을 쓰는 사람」(1분 캐시)이 전날 밤 22:07 값으로 떴다 — 홈에는 시각도 안 붙는다.
 *  - 웹 지표(1시간 캐시)가 이틀 전(11/23 14:00)에 만든 「11/16~11/22」 주를 보여 줬다. 다시 부르니 11/18~11/24.
 *
 * 그래서 값에 읽은 시각을 붙여 두고, revalidate 보다 오래됐으면 **기다려서 새로 읽는다.**
 * 새로 읽기가 실패하면 옛 값이라도 낸다(없는 것보다 낫고, 화면은 값에 딸린 기준 시각을 적는다).
 * 실패는 지금처럼 캐시에 남지 않는다 — 처음 읽기가 throw 하면 그대로 throw 한다.
 */
export interface Stamped<T> {
  at: number;
  data: T;
}

/** 캐시가 준 값이 maxAgeMs 안이면 그대로, 아니면 다시 읽는다(실패하면 옛 값). Next 없이 시험할 수 있게 따로 둔다. */
export async function freshOrStale<T>(hit: Stamped<T>, read: () => Promise<T>, maxAgeMs: number, now = Date.now()): Promise<T> {
  if (Number.isFinite(hit.at) && now - hit.at <= maxAgeMs) return hit.data;
  try {
    return await read();
  } catch (e) {
    console.error("[freshCache] 만료된 값을 새로 읽지 못해 앞선 값을 냅니다", e);
    return hit.data;
  }
}

export function freshCache<A extends unknown[], T>(
  read: (...args: A) => Promise<T>,
  keyParts: string[],
  opts: { revalidate: number }
): (...args: A) => Promise<T> {
  // 값 모양이 { at, data } 로 바뀌므로 키를 따로 둔다 — 옛 항목을 값으로 읽지 않게
  const cached = unstable_cache(async (...args: A): Promise<Stamped<T>> => ({ at: Date.now(), data: await read(...args) }), [...keyParts, "fresh-v1"], opts);
  return async (...args: A) => freshOrStale(await cached(...args), () => read(...args), opts.revalidate * 1000);
}
