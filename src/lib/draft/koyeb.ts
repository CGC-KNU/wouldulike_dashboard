/**
 * 대시보드 서버 → 백엔드(Koyeb) 부르기 — **잠든 지역의 503 만** 다시 보낸다(1015).
 *
 * 백엔드는 도쿄·싱가포르 두 지역에 떠 있고 한가하면 지역마다 따로 잠든다(백엔드 #156 부터).
 * 잠든 쪽에 닿은 요청은 Koyeb 가 앱에 넘기지 않고 「Your service is almost ready!」 503 을 준다.
 * 그걸 그대로 받으면 담당자는 엉뚱한 말을 본다 — 1015 `/r/store` 가 로그인 확인(`/admin/me/`)에서 이 503 을 받아
 * 「로그인이 필요합니다」를 띄웠다. 러너(`scripts/probe-report-share.mjs` backend())와 같은 판정이다.
 *
 * 앱에 닿지 않은 요청이라 POST·PATCH 도 다시 보내도 안전하다. 다만 body 는 다시 보낼 수 있는 값(문자열)이어야 한다 —
 * 여기를 거치는 곳은 모두 JSON.stringify 한 문자열이다.
 *
 * 화면에서 부르는 길이라 오래 붙잡지 않는다 — 2초 간격 다섯 번(최대 약 8초). 두 지역을 번갈아 가므로 대개 한두 번에 깬 쪽에 닿는다.
 */

export const KOYEB_TRIES = 5;
const WAIT_MS = 2000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Koyeb 가 앱 대신 돌려준 「깨우는 중」 503 인가 */
export const isKoyebWaking = (status: number, body: string) => status === 503 && body.includes("almost ready");

export async function koyebFetch(
  input: string,
  init?: RequestInit,
  opts: { tries?: number; waitMs?: number; fetchFn?: typeof fetch } = {}
): Promise<Response> {
  const tries = opts.tries ?? KOYEB_TRIES;
  const waitMs = opts.waitMs ?? WAIT_MS;
  const f = opts.fetchFn ?? fetch;
  for (let attempt = 1; ; attempt++) {
    const res = await f(input, init);
    if (res.status !== 503 || attempt >= tries) return res;
    // 503 일 때만 본문을 읽는다 — 앱이 낸 503 이면 읽은 본문으로 같은 응답을 다시 만들어 돌려준다
    const text = await res.text();
    if (!isKoyebWaking(res.status, text)) return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
    await sleep(waitMs);
  }
}
