import { clientFromEnv, ISSUE_KEY_SOURCES } from "./appMetrics";

/**
 * Probe · **사장님께 드리는 월간 보고서**가 쓰는 앱 쪽 숫자.
 *
 * 앱 지표 보고서(`appMetrics.ts`)와 세는 대상이 다르다. 그쪽은 「앱이 잘 돌아가는가」를
 * 보려고 세션·비율을 재고, 여기는 **「가게가 얼마나 보였고 학생이 무엇을 했나」**를 센다.
 * 사장님이 궁금한 건 DAU/WAU 가 아니라 "내 가게 화면이 열렸나"다.
 *
 * ── 가게별로 가르지 않는다 ──
 * 이 보고서는 **모든 제휴 가게에 공통**으로 나간다. 가게별 숫자는 매장 리포트(`/r/<토큰>`)가 맡는다.
 * 그래서 여기서는 합계만 내고, 어느 가게가 몇 번 열렸는지는 계산하지 않는다 —
 * 공통 보고서에 특정 가게 숫자가 섞이면 받는 사람마다 다른 말이 된다.
 *
 * ── 기기를 센다 ──
 * 출시된 앱이 `setUserId` 를 안 불러 전부 `user_pseudo_id`(기기)다. 재설치하면 새로 센다.
 * 보고서 각주에 그대로 밝힌다.
 */
export interface PartnerExposure {
  window: { from: string; to: string; days: number };
  /** 가게 소개 화면이 열린 횟수 */
  store_opens: number;
  /** 하루 평균 — 달마다 일수가 달라(8월 31일·9월 30일) 합계끼리 견주면 짧은 달이 손해다 */
  store_opens_per_day: number;
  /** 가게를 한 번이라도 들여다본 기기 수 */
  store_viewers: number;
  /** 한 번이라도 열린 가게 수 */
  stores_seen: number;
  /** 앱을 켠 기기 수 */
  active_devices: number;
  /** 가게에서 실제로 쓰인 쿠폰 수 · 쓴 기기 수 */
  coupons_used: number;
  coupon_users: number;
  /** 캠페인 자동 지급을 뺀 발급 — 「받아 둔 쿠폰」을 말할 때 쓴다 */
  coupons_issued_organic: number;
  /** 스탬프 적립 횟수 */
  stamps: number;
}

export type PartnerExposureRead =
  | { ok: true; data: PartnerExposure }
  | { ok: false; reason: "no_key" | "error"; detail?: string };

const dash = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const num = (v: unknown) => Number(v ?? 0);

export async function readPartnerExposure(
  env: Record<string, string | undefined> = process.env,
  opts: { start: string; end: string }
): Promise<PartnerExposureRead> {
  const client = clientFromEnv(env);
  if (!client) return { ok: false, reason: "no_key" };
  const { dataset, run } = client;
  const { start, end } = opts;
  if (start > end) return { ok: false, reason: "error", detail: `창이 거꾸로입니다 — ${start} > ${end}` };

  const events = `\`${dataset}.events_*\``;
  const rid = `(SELECT COALESCE(CAST(value.int_value AS STRING), value.string_value) FROM UNNEST(event_params) WHERE key='restaurant_id')`;
  const src = `(SELECT value.string_value FROM UNNEST(event_params) WHERE key='coupon_issue_source')`;
  const known = [...ISSUE_KEY_SOURCES].map((v) => `'${v}'`).join(",");

  try {
    const [r] = await run<Record<string, number>>(
      `SELECT
         COUNTIF(event_name = 'restaurant_detail_open') AS store_opens,
         COUNT(DISTINCT IF(event_name = 'restaurant_detail_open', user_pseudo_id, NULL)) AS store_viewers,
         COUNT(DISTINCT IF(event_name = 'restaurant_detail_open', ${rid}, NULL)) AS stores_seen,
         COUNT(DISTINCT user_pseudo_id) AS active_devices,
         COUNTIF(event_name = 'coupon_redeemed') AS coupons_used,
         COUNT(DISTINCT IF(event_name = 'coupon_redeemed', user_pseudo_id, NULL)) AS coupon_users,
         COUNTIF(event_name = 'coupon_issued' AND ${src} IN (${known})) AS coupons_issued_organic,
         COUNTIF(event_name = 'stamp_issued') AS stamps
       FROM ${events} WHERE _TABLE_SUFFIX BETWEEN @start AND @end`,
      { start, end }
    );
    const days = Math.round((Date.parse(dash(end)) - Date.parse(dash(start))) / 86_400_000) + 1;
    const opens = num(r?.store_opens);
    return {
      ok: true,
      data: {
        window: { from: dash(start), to: dash(end), days },
        store_opens: opens,
        store_opens_per_day: days > 0 ? Math.round((opens / days) * 10) / 10 : 0,
        store_viewers: num(r?.store_viewers),
        stores_seen: num(r?.stores_seen),
        active_devices: num(r?.active_devices),
        coupons_used: num(r?.coupons_used),
        coupon_users: num(r?.coupon_users),
        coupons_issued_organic: num(r?.coupons_issued_organic),
        stamps: num(r?.stamps),
      },
    };
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message.slice(0, 160) : "알 수 없는 오류" };
  }
}
