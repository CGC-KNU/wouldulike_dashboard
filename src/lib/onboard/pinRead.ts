import { backendUrl, getAccessToken } from "@/lib/apiProxy";
import { tempPinFor } from "@/lib/onboard/token";

/**
 * 매장의 현재 PIN 을 서버 계정으로 읽는다 (0928 — PIN 은 다시 읽을 수 있다).
 *
 *   pin        읽은 값. 없으면 null.
 *   has_pin    걸려 있는가.
 *   unreadable 걸려 있는데 못 읽는 줄(0925~0928 hmac). 사장님이 한 번 로그인하면 읽히는 모양으로 올라간다.
 *   is_temp    우리가 온보딩 때 심은 임시 PIN 인가.
 *
 * 온보딩 세션·[0] PIN 변경·링크 발급이 같이 쓴다. 전에는 "우리 임시 PIN 인가" 만 물을 수 있어서,
 * 사장님이 PIN 을 이미 정한 매장은 링크를 다시 낼 때 그 PIN 을 갈아엎는 수밖에 없었다.
 */
export async function readStorePin(rid: number): Promise<{ pin: string | null; has_pin: boolean; unreadable: boolean; is_temp: boolean }> {
  const none = { pin: null, has_pin: false, unreadable: false, is_temp: false };
  try {
    const admin = await getAccessToken();
    const r = await fetch(backendUrl("/api/dashboard/restaurant/", `restaurant_id=${rid}`), { headers: { Authorization: `Bearer ${admin}` }, cache: "no-store" });
    if (!r.ok) return none;
    const j = (await r.json().catch(() => ({}))) as { has_pin?: boolean; pin?: string | null; pin_unreadable?: boolean };
    const pin = typeof j.pin === "string" && j.pin ? j.pin : null;
    return { pin, has_pin: Boolean(j.has_pin), unreadable: Boolean(j.pin_unreadable), is_temp: pin !== null && pin === tempPinFor(rid) };
  } catch { return none; }
}
