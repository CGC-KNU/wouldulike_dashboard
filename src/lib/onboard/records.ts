import { notifyPartnerOps } from "@/lib/slack";

/**
 * 온보딩 기록 — **어디에 남기나.**
 *
 * 백엔드에 온보딩 테이블이 없다. 그래서 동의 기록은 세 곳에 나눠 쓴다. 하나라도 남으면 증거는 산다.
 *
 *   1. 백엔드 `astro/activities` — 매장에 붙는 활동 기록. 백엔드가 살아 있고 토큰이 권한이 있으면 남는다.
 *      점주 토큰은 403 이 날 수 있어 "최선 노력"이다.
 *   2. 구글 시트 (Apps Script 브리지) — 우리가 통제하는 append-only 원장. `ONBOARD_GSHEET_*`.
 *   3. 구글 드라이브 (자료실 업로드 브리지) — 계약서 사본 HTML + 동의 JSON. `ONBOARD_DRIVE_*`.
 *
 * 셋 다 실패하면 완료 처리하지 않는다 — 기록 없는 계약을 "됐다"고 말하면 안 된다.
 * 어느 사본이 남았는지는 응답과 슬랙에 그대로 적는다.
 */

const API = () => process.env.NEXT_PUBLIC_API_URL ?? "";

export interface ConsentRecord {
  kind: "consent" | "complete";
  short_id: string;
  rid: number;
  lid: string | null;
  name: string;
  campus: string;
  plan: string;
  fee: number;
  terms_version: string;
  terms_hash: string;
  checks: Record<string, string>; // check id → ISO 시각
  signature: string;
  owner_name: string;
  biz_no: string;
  phone: string;
  phone_verified: boolean;
  email: string;
  kakao_id: string | null;
  ip: string;
  ua: string;
  at: string; // ISO
  /** complete 에서만: 스탬프 규칙 존재 여부, 키트 배송지 */
  stamp_ok?: boolean;
  kit_address?: string;
  copies?: { activity: boolean; sheet: boolean; drive_contract: string | null; drive_json: string | null };
}

export interface CopyResult { activity: boolean; sheet: boolean; drive_contract: string | null; drive_json: string | null; errors: string[] }

/* ── 1. 백엔드 활동 기록 ── */
export async function postActivity(token: string, rid: number, kind: string, body: string, author: string): Promise<boolean> {
  if (!API()) return false;
  try {
    const res = await fetch(`${API()}/api/astro/activities/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ target_type: "store", target_id: String(rid), kind, body, author }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ── 2. 구글 시트 브리지 (비서 bin/gsheet 와 같은 Web App) ── */
async function sheetAppend(row: (string | number | boolean | null)[]): Promise<boolean> {
  const url = process.env.ONBOARD_GSHEET_URL, token = process.env.ONBOARD_GSHEET_TOKEN, id = process.env.ONBOARD_GSHEET_ID;
  const sheet = process.env.ONBOARD_GSHEET_TAB ?? "온보딩기록";
  if (!url || !token || !id) return false;
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "append", id, sheet, row, token }), redirect: "follow", cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return Boolean(j.ok);
  } catch {
    return false;
  }
}

/* ── 3. 드라이브 브리지 (자료실_업로드.gs 와 같은 Web App) ── */
async function driveUpload(name: string, content: string, mime: string): Promise<string | null> {
  const url = process.env.ONBOARD_DRIVE_URL, token = process.env.ONBOARD_DRIVE_TOKEN;
  if (!url || !token) return null;
  try {
    const b64 = Buffer.from(content, "utf8").toString("base64");
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "upload", name, b64, mime, token }), redirect: "follow", cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string };
    return j.ok && j.url ? j.url : null;
  } catch {
    return null;
  }
}

/** 동의·완료 기록을 세 곳에 쓴다. 어디에 남았는지 돌려준다. */
export async function persistRecord(rec: ConsentRecord, opts: { ownerToken: string; contractHtml?: string }): Promise<CopyResult> {
  const errors: string[] = [];
  const stamp = rec.at.replace(/[-:]/g, "").slice(0, 15);
  const base = `온보딩_${rec.rid}_${rec.name}_${stamp}`;

  const [activity, sheet, drive_json, drive_contract] = await Promise.all([
    postActivity(opts.ownerToken, rec.rid, rec.kind === "consent" ? "계약동의" : "온보딩완료", JSON.stringify(rec), "onboard").catch(() => false),
    sheetAppend([
      rec.at, rec.kind, rec.short_id, rec.rid, rec.lid ?? "", rec.name, rec.campus, rec.plan, rec.fee,
      rec.owner_name, rec.biz_no, rec.phone, rec.phone_verified ? "Y" : "N", rec.email, rec.kakao_id ?? "",
      rec.signature, rec.terms_version, rec.terms_hash, JSON.stringify(rec.checks), rec.ip, rec.ua.slice(0, 160),
      rec.stamp_ok === undefined ? "" : rec.stamp_ok ? "Y" : "N", rec.kit_address ?? "",
    ]).catch(() => false),
    driveUpload(`${base}_${rec.kind}.json`, JSON.stringify(rec, null, 2), "application/json").catch(() => null),
    opts.contractHtml ? driveUpload(`${base}_계약서.html`, opts.contractHtml, "text/html").catch(() => null) : Promise.resolve(null),
  ]);

  if (!activity) errors.push("백엔드 활동기록 실패");
  if (!sheet) errors.push(process.env.ONBOARD_GSHEET_URL ? "시트 기록 실패" : "시트 미설정");
  if (!drive_json) errors.push(process.env.ONBOARD_DRIVE_URL ? "드라이브 JSON 실패" : "드라이브 미설정");
  if (opts.contractHtml && !drive_contract) errors.push("드라이브 계약서 사본 실패");
  return { activity, sheet, drive_contract, drive_json, errors };
}

export const anyCopy = (c: CopyResult) => c.activity || c.sheet || Boolean(c.drive_json);

/* ── 슬랙 ── */
export async function notifyOnboard(text: string): Promise<void> {
  await notifyPartnerOps(text);
}

/* ── 혜택 프리셋 — [3] 단계. 빈 폼 금지. ── */
export const STAMP_PRESETS = [
  { count: 5, reward: "음료 1잔 무료" },
  { count: 7, reward: "사이드 메뉴 1개 서비스" },
  { count: 10, reward: "대표 메뉴 1인분 무료" },
] as const;

export const COUPON_PRESETS = [
  { title: "우주라이크 첫 방문 음료 1잔", sub: "음료 1잔 무료", cond: "1인 1회 · 식사 주문 시" },
  { title: "우주라이크 쿠폰 1,000원 할인", sub: "1,000원 할인", cond: "최소 주문 1만원 이상 · 1인 1회" },
  { title: "우주라이크 사이드 서비스", sub: "사이드 메뉴 1개", cond: "2인 이상 방문 시" },
] as const;

/* ── 요청 메타 ── */
export function clientMeta(req: Request): { ip: string; ua: string } {
  const h = req.headers;
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return { ip, ua: h.get("user-agent") ?? "" };
}
