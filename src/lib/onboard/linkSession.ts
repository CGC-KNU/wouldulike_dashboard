import { backendUrl } from "@/lib/apiProxy";

/**
 * 임시 PIN 없는 온보딩 (0929 민열님: "임시 PIN 이라는 개념을 없애면 되는 거 아님?").
 *
 * 백엔드 `POST /api/dashboard/auth/onboard-session/ {token}` 이 링크 서명을 직접 검증하고 그 매장의
 * 점주 계정을 만든다. 매장 번호는 링크에서만 오므로 다른 매장 점주 계정으로 열어도 정확히 들어간다.
 *
 * Koyeb 에 ONBOARD_SECRET 이 없으면 503 "미설정" — 그때는 부르는 쪽이 예전 길(임시 PIN)로 간다.
 */
export type LinkSessionResult =
  | { kind: "ok"; access: string; refresh?: string; restaurant_id?: number }
  | { kind: "unavailable" }                      // 입구가 없거나 열쇠 미설정 → 예전 길로
  | { kind: "error"; status: number; message: string };

export async function linkSession(bearer: string, token: string): Promise<LinkSessionResult> {
  try {
    const r = await fetch(backendUrl("/api/dashboard/auth/onboard-session/"), {
      method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({ token }), cache: "no-store",
    });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; access?: string; refresh?: string; restaurant_id?: number; message?: string; reason?: string };
    if (r.status === 404 || r.status === 405 || r.status === 503) return { kind: "unavailable" };
    if (r.ok && j.success && j.access) return { kind: "ok", access: j.access, refresh: j.refresh, restaurant_id: j.restaurant_id };
    return { kind: "error", status: r.status, message: j.message ?? `로그인하지 못했습니다 (${r.status}).` };
  } catch {
    return { kind: "unavailable" };
  }
}

/** 새 길이 켜져 있나 — 발급 때 임시 PIN 을 심을지 정한다. 가짜 토큰에 400(형식)이면 켜진 것, 503 이면 열쇠 없음. */
export async function linkSessionReady(bearer: string): Promise<boolean> {
  try {
    const r = await fetch(backendUrl("/api/dashboard/auth/onboard-session/"), {
      method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({ token: "x" }), cache: "no-store",
    });
    return r.status === 400;
  } catch { return false; }
}
