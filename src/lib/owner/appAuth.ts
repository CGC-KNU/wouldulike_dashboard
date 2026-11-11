import { koyebFetch } from "../draft/koyeb";

export class OwnerError extends Error {
  constructor(public status: number, public code: string, message: string, public upstreamData?: JsonObject) { super(message); }
}
export type JsonObject = Record<string, any>; // Existing Django JSON contracts are validated at the boundary.
export interface OwnerRequestContext {
  readonly access: string;
  readonly restaurantId: number;
  readonly signal: AbortSignal;
}
export type Backend = (path: string, init?: RequestInit) => Promise<{ status: number; data: JsonObject }>;
export const backend: Backend = async (path, init = {}) => {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) throw new OwnerError(503, "upstream_unavailable", "서버 연결 설정을 확인하지 못했습니다.");
  try {
    const res = await koyebFetch(`${base.replace(/\/$/, "")}${path}`, {
      ...init, cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") throw new OwnerError(502, "upstream_invalid", "서버 응답을 읽지 못했습니다.");
    return { status: res.status, data };
  } catch (e) {
    if (e instanceof OwnerError) throw e;
    throw new OwnerError(502, "upstream_unavailable", "서버에 연결하지 못했습니다. 잠시 뒤 다시 확인해 주세요.");
  }
};
export function ownerModeEnabled() { return ["true", "1"].includes(process.env.APP_OWNER_MODE_ENABLED ?? ""); }
export function positiveId(value: unknown): number {
  if (!/^[1-9]\d*$/.test(String(value ?? "")) || !Number.isSafeInteger(Number(value)))
    throw new OwnerError(400, "invalid_input", "유효한 restaurant_id가 필요합니다.");
  return Number(value);
}
export async function authenticateOwner(req: Request, restaurantId?: number, call: Backend = backend): Promise<OwnerRequestContext> {
  const match = /^Bearer ([^\s,]+)$/.exec(req.headers.get("authorization") ?? "");
  if (!match) throw new OwnerError(401, "app_auth_required", "로그인이 필요합니다.");
  const signal = AbortSignal.timeout(25000);
  const exchanged = await call("/api/dashboard/auth/app-token/", {
    method: "POST", signal,
    body: JSON.stringify({ token: match[1], ...(restaurantId ? { restaurant_id: restaurantId } : {}) }),
  });
  if ([401, 403].includes(exchanged.status)) {
    const me = await call("/api/partner/me/", { signal, headers: { Authorization: `Bearer ${match[1]}` } });
    if ([401, 403].includes(me.status)) throw new OwnerError(401, "app_auth_required", "로그인을 다시 확인해 주세요.");
    if (me.status !== 200 || typeof me.data.is_partner !== "boolean" || !Array.isArray(me.data.stores))
      throw new OwnerError(502, "upstream_invalid", "권한을 확인하지 못했습니다.");
    throw new OwnerError(403, "owner_access_revoked", "현재 매장의 점주 권한이 없습니다.");
  }
  if (exchanged.status < 200 || exchanged.status >= 300)
    throw new OwnerError(502, "upstream_unavailable", "권한을 확인하지 못했습니다.");
  const d = exchanged.data;
  if (d.is_owner !== true || typeof d.access !== "string" || !d.access)
    throw new OwnerError(502, "upstream_invalid", "권한 응답을 확인하지 못했습니다.");
  if (!Number.isSafeInteger(d.restaurant_id) || d.restaurant_id <= 0)
    throw new OwnerError(502, "upstream_invalid", "권한 응답을 확인하지 못했습니다.");
  const actual = d.restaurant_id as number;
  if (restaurantId !== undefined && actual !== restaurantId)
    throw new OwnerError(409, "store_context_mismatch", "매장 정보가 일치하지 않습니다.");
  // Refresh is deliberately discarded. No cookies, shared cache or service token.
  return Object.freeze({ access: d.access, restaurantId: actual, signal });
}
export function checkStore(data: unknown, restaurantId: number): void {
  if (Array.isArray(data)) { data.forEach((x) => checkStore(x, restaurantId)); return; }
  if (!data || typeof data !== "object") return;
  const obj = data as JsonObject;
  if (obj.restaurant_id != null && Number(obj.restaurant_id) !== restaurantId)
    throw new OwnerError(409, "store_context_mismatch", "매장 정보가 일치하지 않습니다.");
  Object.values(obj).forEach((x) => checkStore(x, restaurantId));
}
export async function ownerCall(ctx: OwnerRequestContext, path: string, method = "GET", body?: unknown, call: Backend = backend): Promise<JsonObject> {
  const sep = path.includes("?") ? "&" : "?";
  const result = await call(`${path}${sep}restaurant_id=${ctx.restaurantId}`, {
    method, signal: ctx.signal, headers: { Authorization: `Bearer ${ctx.access}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (result.status < 200 || result.status >= 300) {
    const status = result.status === 401 ? 502 : result.status;
    throw new OwnerError(status, result.status === 403 ? "owner_access_revoked" : "upstream_error",
      typeof result.data.detail === "string" ? result.data.detail : "요청을 처리하지 못했습니다.", result.data);
  }
  checkStore(result.data, ctx.restaurantId);
  return result.data;
}
