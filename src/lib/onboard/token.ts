import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * 점주 온보딩 링크 토큰 — **무상태(stateless)** 서명 토큰.
 *
 * 왜 저장소가 없나: 백엔드(Django)에 온보딩 테이블이 없고, 이 레포의 초안 저장소는 배포하면 날아간다
 * (`lib/draft/store.ts` 머리말). 점주에게 나가는 링크가 재배포 한 번에 죽으면 안 되므로,
 * 링크에 필요한 것을 전부 토큰 안에 넣고 HMAC 으로 서명한다. 서버는 비밀키만 있으면 검증한다.
 *
 * 1회성은 어떻게 보장하나: 발급 시 매장에 **임시 PIN** 을 심고(`tp`), 온보딩 [0]단계에서 점주가 PIN 을
 * 자기 것으로 바꾼다. 그 뒤로는 같은 토큰으로 세션을 만들 수 없다 — 임시 PIN 이 더 이상 맞지 않는다.
 *
 * 토큰 모양: base64url(payload JSON) + "." + base64url(HMAC-SHA256)
 */

export type OnboardPlan = "FREE" | "BOOST" | "PREMIUM";

export interface OnboardPayload {
  v: 1;
  /** 대시보드 매장 id (restaurant_id) */
  rid: number;
  /** Astro 후보 id — 완료 시 단계를 '계약 완료'로 옮긴다. 없을 수 있다. */
  lid: string | null;
  name: string;
  campus: string;
  plan: OnboardPlan;
  /** 월 이용료(부가세 별도). 미팅에서 정한 값이 계약서에 그대로 박힌다. */
  fee: number;
  iat: number;
  exp: number;
  /** 무작위 nonce — 같은 매장에 두 번 발급해도 토큰이 다르다. */
  n: string;
  /** 임시 PIN(4자리). 점주는 이 값을 보지 않는다 — 세션 교환에만 쓰고 [0]단계에서 갈아엎는다. */
  tp: string;
  /** 발급한 담당자 */
  by: string;
}

const b64u = (buf: Buffer) => buf.toString("base64url");
const fromB64u = (s: string) => Buffer.from(s, "base64url");

function secret(): Buffer {
  const s = process.env.ONBOARD_SECRET;
  if (s && s.length >= 16) return Buffer.from(s, "utf8");
  if (process.env.NODE_ENV === "production") {
    throw new Error("ONBOARD_SECRET 이 없습니다. Vercel 환경변수에 32자 이상 무작위 문자열로 넣어 주세요.");
  }
  // 로컬 개발용 — 운영에서는 위에서 막힌다
  return Buffer.from("dev-only-onboard-secret-do-not-use-in-prod", "utf8");
}

function mac(data: string): Buffer {
  return createHmac("sha256", secret()).update(data).digest();
}

export const ONBOARD_TOKEN_RE = /^[A-Za-z0-9_-]{40,600}\.[A-Za-z0-9_-]{43}$/;

export function signOnboardToken(p: Omit<OnboardPayload, "v" | "iat" | "exp" | "n" | "tp"> & { days?: number; tp?: string }): { token: string; payload: OnboardPayload } {
  const now = Math.floor(Date.now() / 1000);
  const payload: OnboardPayload = {
    v: 1,
    rid: p.rid, lid: p.lid ?? null, name: p.name, campus: p.campus, plan: p.plan, fee: p.fee,
    iat: now,
    exp: now + 60 * 60 * 24 * (p.days ?? 14),
    n: b64u(randomBytes(9)),
    tp: p.tp ?? newTempPin(),
    by: p.by,
  };
  const body = b64u(Buffer.from(JSON.stringify(payload), "utf8"));
  return { token: `${body}.${b64u(mac(body))}`, payload };
}

export type VerifyResult = { ok: true; payload: OnboardPayload } | { ok: false; reason: "형식" | "서명" | "만료" };

export function verifyOnboardToken(token: string): VerifyResult {
  if (!ONBOARD_TOKEN_RE.test(token)) return { ok: false, reason: "형식" };
  const [body, sig] = token.split(".");
  const expected = mac(body);
  const given = fromB64u(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "서명" };
  let payload: OnboardPayload;
  try {
    payload = JSON.parse(fromB64u(body).toString("utf8")) as OnboardPayload;
  } catch {
    return { ok: false, reason: "형식" };
  }
  if (payload.v !== 1 || typeof payload.rid !== "number") return { ok: false, reason: "형식" };
  if (payload.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: "만료" };
  return { ok: true, payload };
}

/** 4자리 임시 PIN — 0000·1111·1234 같은 흔한 값은 피한다. */
export function newTempPin(): string {
  for (;;) {
    const n = randomBytes(2).readUInt16BE(0) % 10000;
    const s = String(n).padStart(4, "0");
    if (/^(\d)\1{3}$/.test(s) || s === "1234" || s === "0123" || s === "1112") continue;
    return s;
  }
}

/** 점주 화면·슬랙에 토큰 전체를 노출하지 않으려고 쓰는 짧은 식별자 */
export function shortId(p: OnboardPayload): string {
  return `${p.rid}-${p.n.slice(0, 6)}`;
}

/**
 * 단계 간 서버 확인용 미니 서명 — "동의 기록이 끝났다"를 쿠키로 들고 다닌다.
 * 저장소 없이 [2]→[6] 순서를 서버가 강제하기 위한 장치다.
 */
export function stepStamp(nonce: string, step: string): string {
  return b64u(mac(`${nonce}:${step}`)).slice(0, 24);
}
export function stepStampOk(nonce: string, step: string, given: string | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(stepStamp(nonce, step));
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
