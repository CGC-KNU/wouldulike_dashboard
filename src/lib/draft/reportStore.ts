import { cookies } from "next/headers";
import { appendDraftItem, patchDraftItem, readDraft, writeDraft } from "./store";
import type { StoreReport } from "./types";

/**
 * 매장 리포트 저장소 — 읽기·쓰기는 전부 여기를 거친다.
 *
 * 백엔드(`NEXT_PUBLIC_API_URL`)가 있으면 **항상** 백엔드 `probe.StoreReport` 를 쓴다. 백엔드가 응답을 못 하면
 * 초안 파일로 조용히 떨어지지 않고 에러를 낸다 — 점주에게 나간 링크가 초안 파일에 들어가면 다음 배포 때 죽는다.
 * 백엔드가 없는 로컬·미리보기에서만 예전 초안 파일(`probe_reports`)을 쓴다.
 */

const KEY = "probe_reports";
const seed = (): StoreReport[] => [];
const BASE = () => process.env.NEXT_PUBLIC_API_URL ?? "";
export const reportsOnBackend = () => Boolean(BASE());

/** 점주에게 링크를 내보내도 되는 저장소인가 — 재배포에도 살아남아야 한다 */
export function reportStorePersistent(): boolean {
  return reportsOnBackend() || Boolean(process.env.DRAFT_DATA_DIR) || process.env.REPORT_STORE === "persistent";
}

export class ReportStoreError extends Error {
  constructor(public status: number, detail: string) { super(detail); }
}

/** 공개 응답에는 만든 사람·열람 수가 없다 — 타입을 맞춰 둔다 */
function normalize(r: Partial<StoreReport> & { id: string }): StoreReport {
  return {
    ...r,
    interpretation: r.interpretation ?? [], proposals: r.proposals ?? [],
    created_by: r.created_by ?? "", approved_by: r.approved_by ?? null,
    views: r.views ?? { count: 0, first_at: null, last_at: null },
  } as StoreReport;
}

async function call<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.auth !== false) headers.Authorization = `Bearer ${(await cookies()).get("access_token")?.value ?? ""}`;
  let res: Response;
  try {
    res = await fetch(`${BASE()}/api/probe${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ReportStoreError(502, "리포트 저장소(백엔드)에 연결하지 못했습니다.");
  }
  if (res.status === 404) return null;
  if (res.status === 204) return null;
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new ReportStoreError(res.status, body.detail ?? `리포트 저장소 오류 (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function listReports(filter: { status?: string; restaurant_id?: number } = {}): Promise<StoreReport[]> {
  if (!reportsOnBackend()) {
    let list = readDraft<StoreReport[]>(KEY, seed);
    if (filter.status) list = list.filter((r) => r.status === filter.status);
    if (filter.restaurant_id !== undefined) list = list.filter((r) => r.restaurant_id === filter.restaurant_id);
    return list;
  }
  const q = new URLSearchParams();
  if (filter.status) q.set("status", filter.status);
  if (filter.restaurant_id !== undefined) q.set("restaurant_id", String(filter.restaurant_id));
  const d = await call<{ reports: StoreReport[] }>(`/reports/${q.size ? `?${q}` : ""}`);
  return (d?.reports ?? []).map(normalize);
}

export async function getReport(id: string): Promise<StoreReport | null> {
  if (!reportsOnBackend()) return readDraft<StoreReport[]>(KEY, seed).find((r) => r.id === id) ?? null;
  const d = await call<{ report: StoreReport }>(`/reports/${encodeURIComponent(id)}/`);
  return d ? normalize(d.report) : null;
}

export async function createReport(r: StoreReport): Promise<StoreReport> {
  if (!reportsOnBackend()) return appendDraftItem<StoreReport>(KEY, seed, r);
  const d = await call<{ report: StoreReport }>("/reports/", { method: "POST", body: JSON.stringify(r) });
  if (!d) throw new ReportStoreError(502, "리포트를 저장하지 못했습니다.");
  return normalize(d.report);
}

export async function patchReport(id: string, patch: Partial<StoreReport>): Promise<StoreReport | null> {
  if (!reportsOnBackend()) return patchDraftItem<StoreReport>(KEY, seed, id, patch);
  const d = await call<{ report: StoreReport }>(`/reports/${encodeURIComponent(id)}/`, { method: "PATCH", body: JSON.stringify(patch) });
  return d ? normalize(d.report) : null;
}

/** 초안·승인 단계에서만 지운다 — 링크가 나갔거나 보낸 리포트는 기록이라 남긴다(호출부가 막는다). */
export async function deleteReport(id: string): Promise<void> {
  if (!reportsOnBackend()) {
    writeDraft<StoreReport[]>(KEY, readDraft<StoreReport[]>(KEY, seed).filter((r) => r.id !== id));
    return;
  }
  await call(`/reports/${encodeURIComponent(id)}/`, { method: "DELETE" });
}

/** 공개 링크로 읽기 — 인증 없음. LINKED·SENT 는 본문, REVOKED 는 상태만, 그 외는 null. */
export async function getReportByToken(token: string): Promise<StoreReport | null> {
  if (!reportsOnBackend()) {
    const r = readDraft<StoreReport[]>(KEY, seed).find((x) => x.token === token);
    return r && ["LINKED", "SENT", "REVOKED"].includes(r.status) ? r : null;
  }
  const d = await call<{ report: StoreReport }>(`/reports/by-token/${token}/`, { auth: false });
  return d ? normalize(d.report) : null;
}

/** 열람 +1 — 링크가 살아 있는(LINKED·SENT) 것만 센다 */
export async function recordReportView(token: string): Promise<void> {
  if (!reportsOnBackend()) {
    const r = readDraft<StoreReport[]>(KEY, seed).find((x) => x.token === token && (x.status === "LINKED" || x.status === "SENT"));
    if (!r) return;
    const now = new Date().toISOString();
    patchDraftItem<StoreReport>(KEY, seed, r.id, { views: { count: r.views.count + 1, first_at: r.views.first_at ?? now, last_at: now } });
    return;
  }
  await call(`/reports/by-token/${token}/view/`, { method: "POST", auth: false }).catch(() => undefined);
}

/** 점주 화면 — 자기 매장의 링크 나간 리포트. 관리자가 파트너 뷰로 볼 때는 restaurant_id 를 넘긴다. */
export async function listMyReports(restaurantId: number, asAdmin: boolean): Promise<StoreReport[]> {
  if (!reportsOnBackend()) {
    return readDraft<StoreReport[]>(KEY, seed).filter((r) => r.restaurant_id === restaurantId && (r.status === "LINKED" || r.status === "SENT") && r.token);
  }
  const d = await call<{ reports: StoreReport[] }>(`/reports/mine/${asAdmin ? `?restaurant_id=${restaurantId}` : ""}`).catch(() => null);
  return (d?.reports ?? []).filter((r) => r.restaurant_id === restaurantId).map(normalize);
}
