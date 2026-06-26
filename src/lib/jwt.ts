/** JWT payload를 파싱합니다. 서명 검증 없이 클라이언트 사이드 판별용으로만 사용. */
export function decodeJwt<T = Record<string, unknown>>(token: string): T {
  const [, payload] = token.split(".");
  if (!payload) throw new Error("Invalid JWT");
  const json = Buffer.from(payload, "base64url").toString("utf-8");
  return JSON.parse(json) as T;
}
