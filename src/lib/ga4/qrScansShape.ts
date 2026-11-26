/**
 * Probe · 매장 QR 의 GA4 칸 — 쿼리 결과를 화면 숫자로 바꾸는 순수 로직(qrScans.ts 가 부른다, tests/qrScans.test.ts).
 *
 * DB 는 적립된 것만 남긴다. 찍었지만 적립이 안 된 스캔(하루 한도 · 로그인 전에 끝남)과
 * 웹 화면만 열고 간 손님은 GA4 에만 있다.
 */

/** 앱 `qr_visit_credit` 의 result 를 네 갈래로. 앱은 credited 아니면 서버 code 또는 http_<상태>를 남긴다 */
export type ScanOutcome = "credited" | "daily_limit" | "not_logged_in" | "other";

export function outcomeOf(result: string | null | undefined): ScanOutcome {
  const r = (result ?? "").trim().toLowerCase();
  if (r === "credited") return "credited";
  if (r.includes("daily_limit")) return "daily_limit";
  if (r === "http_401" || r === "unauthorized" || r === "not_authenticated") return "not_logged_in";
  return "other";
}

export interface AppScanRow { rid: string | null; result: string | null; n: number }
export interface AppScanStore { scans: number; credited: number; daily_limit: number; not_logged_in: number }
export interface AppScans {
  scans: number;
  devices: number;
  credited: number;
  daily_limit: number;
  not_logged_in: number;
  other: number;
  /** 그 밖에 들어간 result 값(네트워크 오류 등) — 화면이 이유로 보여 준다 */
  other_reasons: string[];
  stores: Record<string, AppScanStore>;
}

export function summarizeAppScans(rows: AppScanRow[], devices: number): AppScans {
  const out: AppScans = { scans: 0, devices, credited: 0, daily_limit: 0, not_logged_in: 0, other: 0, other_reasons: [], stores: {} };
  const reasons = new Set<string>();
  for (const r of rows) {
    const n = Number(r.n) || 0;
    const o = outcomeOf(r.result);
    out.scans += n;
    out[o] += n;
    if (o === "other" && r.result) reasons.add(r.result);
    if (r.rid) {
      const s = (out.stores[r.rid] ??= { scans: 0, credited: 0, daily_limit: 0, not_logged_in: 0 });
      s.scans += n;
      if (o !== "other") s[o] += n;
    }
  }
  out.other_reasons = [...reasons].sort();
  return out;
}

/** 웹 스탬프 이벤트. 로그인 시작은 매장 화면(/s/<id>)에서, 완료는 카카오 콜백(/auth/kakao)에서 찍힌다 */
export interface WebEventRow { event: string; path: string; n: number }
export interface WebScans {
  views: number;
  /** 화면을 연 사람(GA4 사용자) — 이벤트 수가 아니라 사람 */
  viewers: number;
  login_start: number;
  login_done: number;
  /** 스탬프 적립 또는 스탬프 없는 매장의 QR 쿠폰 받기 성공 */
  earned: number;
  install_click: number;
  stores: Record<string, { views: number; earned: number }>;
}

const storeOfPath = (path: string): string | null => /^\/s\/(\d+)(?:\/|$)/.exec(path)?.[1] ?? null;

export function summarizeWebScans(rows: WebEventRow[], viewers: number): WebScans {
  const out: WebScans = { views: 0, viewers, login_start: 0, login_done: 0, earned: 0, install_click: 0, stores: {} };
  for (const r of rows) {
    const n = Number(r.n) || 0;
    const rid = storeOfPath(r.path);
    const store = () => (out.stores[rid as string] ??= { views: 0, earned: 0 });
    if (r.event === "web_stamp_view") {
      out.views += n;
      if (rid) store().views += n;
    } else if (r.event === "web_login") {
      if (r.path.startsWith("/auth/kakao")) out.login_done += n;
      else out.login_start += n;
    } else if (r.event === "web_stamp_add") {
      out.earned += n;
      if (rid) store().earned += n;
    } else if (r.event === "web_install_click") {
      out.install_click += n;
    }
  }
  return out;
}

/** GA4 칸이 세는 창 — 요청한 기간을 어제(한국)까지로 자른다. 시작이 어제보다 늦으면 null(셀 날이 없다) */
export function gaWindow(start: string, end: string, yesterday: string): { start: string; end: string } | null {
  const e = end < yesterday ? end : yesterday;
  return start > e ? null : { start, end: e };
}
