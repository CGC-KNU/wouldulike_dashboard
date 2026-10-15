import { readLastEventDate } from "@/lib/bigquery/appMetrics";
import { EVENT_LIVE_FROM } from "@/lib/bigquery/couponFunnel";
import { readStoreActivity } from "@/lib/bigquery/storeActivity";
import { buildStoreMonthlyData, type Json, type Num, type PartnerMonth } from "./storeMonthly";
import { previousPeriod } from "./appReportMonthly";
import { monthWindow, lastCompleteMonth } from "./appReport";
import { fetchBackendResult } from "./toolProxy";

/**
 * Probe · **매장 하나의 사장님 월간 보고서** 발급 — 가져오기만 한다(1015).
 *
 * 모양 만들기는 `storeMonthly.ts`, 양식 끼우기는 `storeMonthlyTemplate.ts`.
 *
 *  · DB 칸 — 백엔드 `/api/astro/partner/month/`(사장님 홈과 같은 세는 법, 한 달 전체 + 지난달 전체).
 *  · 가게 화면을 연 학생 — GA4 `restaurant_detail_open` 기기 수(`readStoreActivity`, 매장 지표 표와 같은 쿼리).
 *
 * 스냅샷을 저장하지 않는다. 부를 때마다 다시 읽는다 — 다만 DB 는 다시 세는 값이라
 * 그 사이 탈퇴한 학생의 쿠폰·스탬프만큼 나중에 줄 수 있다(백엔드 partner_month 주석).
 */

export interface StoreReportBuild {
  data: Json;
  filename: string;
  period: string;
  storeName: string;
  /** 담당자가 볼 주의 — 종이에는 안 나간다 */
  warnings: string[];
}

/** 보고서를 만들 수 없는 이유. 라우트가 그대로 화면에 띄운다 */
export class StoreReportError extends Error {
  constructor(public status: number, public title: string, message: string) {
    super(message);
  }
}

const DETAIL_FROM = EVENT_LIVE_FROM.restaurant_detail_open;
const dash = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

/**
 * 그 달 가게 화면을 연 기기 수. 못 읽었거나 이벤트가 생기기 전 달이면 null(0 이 아니라 모름).
 * 조회는 성공했는데 그 매장 줄이 없으면 0 이다 — 아무도 안 열었다.
 */
async function viewersIn(rid: number, win: { start: string; end: string }, label: string, warnings: string[]): Promise<Num> {
  if (win.start < DETAIL_FROM) {
    warnings.push(`${label} 가게 화면 열람은 이벤트가 ${dash(DETAIL_FROM)} 부터라 비웁니다.`);
    return null;
  }
  const r = await readStoreActivity(process.env, win);
  if (!r.ok) {
    warnings.push(`${label} 가게 화면 열람(GA4)을 읽지 못했습니다 — ${r.reason === "no_key" ? "GCP_SA_KEY 미설정" : r.detail ?? "조회 실패"}`);
    return null;
  }
  return r.data.stores[String(rid)]?.detail_devices ?? 0;
}

/** 한 달치. `period` 를 안 주면 **마지막으로 다 끝난 달**. */
export async function buildStoreMonthlyReport(opts: { rid: number; period?: string }): Promise<StoreReportBuild> {
  const warnings: string[] = [];
  const period = opts.period ?? lastCompleteMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new StoreReportError(400, "month 값을 읽지 못했습니다.", `"${period}" — YYYY-MM 으로 주세요.`);

  const res = await fetchBackendResult<PartnerMonth>("/api/astro/partner/month/", `restaurant_id=${opts.rid}&period=${period}`);
  if (res.status === 404) throw new StoreReportError(404, "매장을 찾을 수 없습니다.", `매장 번호 ${opts.rid} 이 앱 매장 목록에 없습니다.`);
  if (res.status === 400) throw new StoreReportError(400, "이 달은 만들 수 없습니다.", `${period} 은 아직 시작하지 않았습니다.`);
  const db = res.data;
  if (!db) throw new StoreReportError(503, "매장 숫자를 읽지 못했습니다.", `백엔드 응답 ${res.status || "없음"} — 잠시 뒤 다시 열어 주세요(Koyeb 가 잠들어 있으면 첫 요청이 실패합니다).`);

  // 사장님께 보낼 수 없는 매장 — 숫자가 없거나, 학생이 볼 수 없는 매장이다
  if (!db.store.is_affiliate) throw new StoreReportError(409, "제휴 매장이 아닙니다.", `${db.store.name} 은 제휴 매장이 아니라 쿠폰·스탬프가 없습니다.`);
  if (db.store.hidden_from_app) throw new StoreReportError(409, "앱에서 숨긴 매장입니다.", `${db.store.name} 은 앱에서 숨겨 두어 학생이 볼 수 없습니다 — 보고서를 만들지 않습니다.`);
  if (!db.complete) throw new StoreReportError(409, "아직 끝나지 않은 달입니다.", `${period} 은 진행 중이라 숫자가 바뀝니다. 끝난 달만 보냅니다.`);

  const win = monthWindow(period);
  const prevWin = monthWindow(previousPeriod(period));
  const last = await readLastEventDate();
  // 확정 테이블이 달 끝보다 이르면 며칠이 빠진다. 숨기지 않고 각주로 밝힌다.
  const through = last && win.end > last ? last : null;
  if (through) warnings.push(`GA4 가 아직 ${through.slice(4, 6)}/${through.slice(6, 8)} 까지만 있어 가게 화면 열람이 달 전체가 아닙니다.`);

  const [viewers, viewersPrev] = await Promise.all([
    viewersIn(opts.rid, { start: win.start, end: through ?? win.end }, `${+period.slice(5, 7)}월`, warnings),
    viewersIn(opts.rid, prevWin, `${+db.prev.period.slice(5, 7)}월`, warnings),
  ]);
  if (db.wishlist_total === null) warnings.push("찜을 세지 못해 비웁니다.");

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const data = buildStoreMonthlyData({ period, db, viewers, viewersPrev, today, through: through ? dash(through) : null });
  if (!(data.photos as string[]).length) warnings.push("매장 정보에 사진이 없어 첫 장(가게 사진) 없이 한 장으로 냅니다.");
  return {
    data,
    filename: `우주라이크_${db.store.name}_${period}`.replace(/[\\/:*?"<>|\s]+/g, "_"),
    period,
    storeName: db.store.name,
    warnings,
  };
}
