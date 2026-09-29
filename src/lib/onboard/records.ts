import { notifyPartnerOps } from "@/lib/slack";
import { getAccessToken } from "@/lib/apiProxy";

/**
 * 온보딩 기록 — **어디에 남기나.**
 *
 * 백엔드에 온보딩 테이블이 없다. 그래서 동의 기록은 세 곳에 나눠 쓴다. 하나라도 남으면 증거는 산다.
 *
 *   1. 백엔드 `astro/activities` — 매장에 붙는 활동 기록. **점주 토큰으로는 403 이다** — astro 뷰가 전부 `_is_admin` 으로
 *      막혀 있다 (wouldulike_backend astro/views.py, 0921 확인). 운영에서는 사실상 남지 않는다고 보고, 2·3 이 원본이다.
 *   2. 구글 시트 (Apps Script 브리지) — 우리가 통제하는 append-only 원장. `ONBOARD_GSHEET_*`.
 *   3. 구글 드라이브 (자료실 업로드 브리지) — 계약서 사본 HTML + 동의 JSON. `ONBOARD_DRIVE_*`.
 *
 * 셋 다 실패하면 완료 처리하지 않는다 — 기록 없는 계약을 "됐다"고 말하면 안 된다.
 * 어느 사본이 남았는지는 응답과 슬랙에 그대로 적는다.
 */

const API = () => process.env.NEXT_PUBLIC_API_URL ?? "";

export interface ConsentRecord {
  /** consent = 계약 동의 · complete = 등록 완료 · revise = 완료 뒤 내용 수정. 원장에서 중복과 수정을 가를 수 있어야 한다. */
  kind: "consent" | "complete" | "revise";
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
  /** 개시일 — 동의한 달의 다음 달 1일. 청구 시작 월이 여기서 나온다 (lib/onboard/contract.ts). */
  starts_on?: string;
  /** complete 에서만: 스탬프 규칙 존재 여부, 키트 배송지 */
  stamp_ok?: boolean;
  kit_address?: string;
  copies?: { activity: boolean; sheet: boolean; drive_contract: string | null; drive_json: string | null };
}

export interface CopyResult { activity: boolean; sheet: boolean; drive_contract: string | null; drive_json: string | null; errors: string[] }

/* ── 1. 백엔드 활동 기록 ──
 * 0929: **서버 계정**으로 쓴다. 전에는 점주 토큰으로 썼는데 0925 전수 점검에서 astro/activities 를
 * 관리자 전용으로 잠그면서 이 사본은 늘 403 이 됐다 — 그리고 그 사실이 어디에도 안 남았다.
 * 실측: 일공초밥 사장님이 [2]에서 "동의 기록을 저장하지 못했습니다" 로 막힘. 세 사본이 다 실패해야
 * 뜨는 문구라, 이 사본만 살아도 계약은 진행된다. 실패 사유는 errText 에 남겨 응답·로그로 나간다. */
export async function postActivity(_ownerToken: string, rid: number, kind: string, body: string, author: string): Promise<boolean | string> {
  if (!API()) return "API 미설정";
  try {
    const admin = await getAccessToken();
    const res = await fetch(`${API()}/api/astro/activities/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${admin}`, "Content-Type": "application/json" },
      body: JSON.stringify({ target_type: "store", target_id: String(rid), kind, body, author }),
      cache: "no-store",
    });
    if (res.ok) return true;
    const t = (await res.text().catch(() => "")).slice(0, 120);
    return `백엔드 ${res.status}${t ? ` ${t}` : ""}`;
  } catch (e) {
    return `백엔드 연결 실패 ${(e as Error).message}`;
  }
}

/* ── 2. 구글 시트 브리지 (비서 bin/gsheet 와 같은 Web App) ──
 *
 * ⚠️ 시트에 **숫자로 읽힐 문자열을 그대로 넣으면 앞자리 0이 사라진다.**
 * 0921 실측: `01012345678` → `1012345678`, `0000000000` → `0`.
 * 계약 증거로 남기는 원장에서 연락처·사업자번호가 틀리면 그 기록은 쓸모가 없다.
 * 그래서 시트에 쓸 때만 하이픈을 넣어 텍스트로 만든다 — 시트가 파싱하지 못하고, 사람이 읽기도 낫다.
 * 드라이브 JSON 에는 원본(숫자만)이 그대로 남는다. 기계가 읽는 쪽과 사람이 읽는 쪽을 나눈 것.
 */
const bizText = (d: string) => { const n = (d ?? "").replace(/\D/g, ""); return n.length === 10 ? `${n.slice(0, 3)}-${n.slice(3, 5)}-${n.slice(5)}` : (d ?? ""); };
const phoneText = (d: string) => {
  const n = (d ?? "").replace(/\D/g, "");
  if (n.length === 11) return `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`;
  return d ?? "";
};

/** true 면 성공, 문자열이면 실패 사유 (브리지가 준 error 나 HTTP 상태). 진단 라우트가 같이 쓴다. */
export async function sheetAppend(row: (string | number | boolean | null)[], sheetName?: string): Promise<true | string> {
  const url = process.env.ONBOARD_GSHEET_URL, token = process.env.ONBOARD_GSHEET_TOKEN, id = process.env.ONBOARD_GSHEET_ID;
  const sheet = sheetName ?? process.env.ONBOARD_GSHEET_TAB ?? "온보딩기록";
  if (!url || !token || !id) return "시트 미설정";
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "append", id, sheet, row, token }), redirect: "follow", cache: "no-store" });
    const text = await res.text().catch(() => "");
    let j: { ok?: boolean; error?: string } = {};
    try { j = JSON.parse(text) as typeof j; } catch { return `시트 응답이 JSON 이 아님 (${res.status}) ${text.slice(0, 80)}`; }
    return j.ok ? true : `시트 ${j.error ?? `실패 (${res.status})`}`;
  } catch (e) {
    return `시트 연결 실패 ${(e as Error).message}`;
  }
}

/** 원장 읽기 — 담당자 쪽 대조(reconcile.ts)가 쓴다. 범위는 "A2:X10000" 처럼 준다. */
export async function sheetRead(range: string): Promise<string[][]> {
  const url = process.env.ONBOARD_GSHEET_URL, token = process.env.ONBOARD_GSHEET_TOKEN, id = process.env.ONBOARD_GSHEET_ID;
  const sheet = process.env.ONBOARD_GSHEET_TAB ?? "온보딩기록";
  if (!url || !token || !id) return [];
  try {
    // 이 브리지의 read 는 `sheet` 가 아니라 **`range`** 를 받는다 ("탭!A1:C10"). 잘못 보내면 HTML 이 온다.
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "read", id, range: `${sheet}!${range}`, token }), redirect: "follow", cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; values?: string[][] };
    return j.ok && Array.isArray(j.values) ? j.values : [];
  } catch {
    return [];
  }
}

/* ── 3. 드라이브 브리지 (자료실_업로드.gs 와 같은 Web App) ── */
/** 성공이면 {url}, 실패면 {err}. */
export async function driveUpload(name: string, content: string, mime: string): Promise<{ url: string | null; err: string | null }> {
  const url = process.env.ONBOARD_DRIVE_URL, token = process.env.ONBOARD_DRIVE_TOKEN;
  if (!url || !token) return { url: null, err: "드라이브 미설정" };
  try {
    const b64 = Buffer.from(content, "utf8").toString("base64");
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "upload", name, b64, mime, token }), redirect: "follow", cache: "no-store" });
    const text = await res.text().catch(() => "");
    let j: { ok?: boolean; url?: string; error?: string } = {};
    try { j = JSON.parse(text) as typeof j; } catch { return { url: null, err: `드라이브 응답이 JSON 이 아님 (${res.status}) ${text.slice(0, 80)}` }; }
    return j.ok && j.url ? { url: j.url, err: null } : { url: null, err: `드라이브 ${j.error ?? `실패 (${res.status})`}` };
  } catch (e) {
    return { url: null, err: `드라이브 연결 실패 ${(e as Error).message}` };
  }
}

/** 동의·완료 기록을 세 곳에 쓴다. 어디에 남았는지 돌려준다. */
export async function persistRecord(rec: ConsentRecord, opts: { ownerToken: string; contractHtml?: string }): Promise<CopyResult> {
  const errors: string[] = [];
  const stamp = rec.at.replace(/[-:]/g, "").slice(0, 15);
  const base = `온보딩_${rec.rid}_${rec.name}_${stamp}`;

  const [activityR, sheetR, driveJsonR, driveContractR] = await Promise.all([
    postActivity(opts.ownerToken, rec.rid, rec.kind === "consent" ? "계약동의" : rec.kind === "revise" ? "온보딩수정" : "온보딩완료", JSON.stringify(rec), "onboard").catch((e) => `백엔드 ${(e as Error).message}`),
    sheetAppend([
      rec.at, rec.kind, rec.short_id, rec.rid, rec.lid ?? "", rec.name, rec.campus, rec.plan, rec.fee,
      rec.owner_name, bizText(rec.biz_no), phoneText(rec.phone), rec.phone_verified ? "Y" : "N", rec.email, rec.kakao_id ?? "",
      rec.signature, rec.terms_version, rec.terms_hash, JSON.stringify(rec.checks), rec.ip, rec.ua.slice(0, 160),
      rec.stamp_ok === undefined ? "" : rec.stamp_ok ? "Y" : "N", rec.kit_address ?? "", rec.starts_on ?? "",
    ]).catch((e) => `시트 ${(e as Error).message}`),
    driveUpload(`${base}_${rec.kind}.json`, JSON.stringify(rec, null, 2), "application/json").catch((e) => ({ url: null, err: `드라이브 ${(e as Error).message}` })),
    opts.contractHtml ? driveUpload(`${base}_계약서.html`, opts.contractHtml, "text/html").catch((e) => ({ url: null, err: `드라이브 ${(e as Error).message}` })) : Promise.resolve({ url: null, err: null }),
  ]);

  const activity = activityR === true, sheet = sheetR === true;
  const drive_json = driveJsonR.url, drive_contract = driveContractR.url;
  if (!activity) errors.push(typeof activityR === "string" ? activityR : "백엔드 활동기록 실패");
  if (!sheet) errors.push(typeof sheetR === "string" ? sheetR : "시트 기록 실패");
  if (!drive_json) errors.push(driveJsonR.err ?? "드라이브 JSON 실패");
  if (opts.contractHtml && !drive_contract) errors.push(driveContractR.err ?? "드라이브 계약서 사본 실패");
  // 어디가 왜 실패했는지를 서버 로그에 남긴다 — 0929 까지는 아무 데도 안 남아 원인을 못 찾았다.
  if (errors.length) console.error(`[onboard/${rec.kind}] rid=${rec.rid} 사본 실패:`, errors.join(" · "));
  return { activity, sheet, drive_contract, drive_json, errors };
}

export const anyCopy = (c: CopyResult) => c.activity || c.sheet || Boolean(c.drive_json);

/* ── 슬랙 ── */
export async function notifyOnboard(text: string): Promise<void> {
  await notifyPartnerOps(text);
}

/* ── 혜택 프리셋 — 시트 '계약 세부사항' 의 실제 표현에서 뽑았다 (0921) ─────────────
 * 점주들이 쓰는 문법은 일관되게 **"무엇을" + "어떤 조건에"** 다.
 *   음료 1캔 (10,000원 이상 주문시) · 냉면 1그릇 (8인 이하, 22시 이전) · 나쵸 1봉지 (치킨 1마리 이상 주문시)
 * 그래서 내용과 조건을 따로 받는다. 합쳐서 한 줄로 받으면 조건을 빼먹고, 나중에 손님과 다툰다.
 *
 * 스탬프도 한 단계가 아니다 — 1/3, 5/10, 5/10/20, 3/5/7 이 실제로 쓰인다.
 * 그래서 1~10 중 여러 개를 고르고 각 칸마다 보상을 적는다.
 */

/** 스탬프 보상 예시 — 고를 때 옆에 보여 주는 실제 사례 */
export const STAMP_EXAMPLES = [
  "에이드 1잔",
  "사이드 메뉴 택 1",
  "타코야끼 10개",
  "모든 음료 50% 할인",
  "치킨 1마리",
] as const;

/** 쿠폰 예시 — 그대로 쓰는 게 아니라 "이런 식으로 적으면 된다"를 보여 주는 것 */
export const COUPON_EXAMPLES = [
  { benefit: "음료 1캔", cond: "10,000원 이상 주문 시" },
  { benefit: "냉면 1그릇", cond: "8인 이하 · 22시 이전" },
  { benefit: "나쵸 1봉지", cond: "치킨 1마리 이상 주문 시 · 테이블당 1개" },
  { benefit: "10% 할인", cond: "현금 결제 시" },
  { benefit: "사이즈업 무료", cond: "아메리카노 주문 시" },
] as const;

/* ── 요청 메타 ── */
export function clientMeta(req: Request): { ip: string; ua: string } {
  const h = req.headers;
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return { ip, ua: h.get("user-agent") ?? "" };
}
