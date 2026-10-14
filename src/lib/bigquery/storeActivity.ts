import { clientFromEnv } from "./appMetrics";
import type { StoreActivity } from "../draft/types";

/**
 * Probe · 매장 지표의 GA4 칸 — 매장별 「상세 열람」과 「사용 실패」.
 *
 * DB 칸(쿠폰 사용·스탬프)만으로는 0 인 매장이 **왜** 0 인지 모른다. 1014 점검에서 「조용한 매장」 대부분이
 * 학생이 상세를 열어 본 매장이었다 — 안 보이는 게 아니라 보고도 안 쓴 것이다. 쿠폰 사용·스탬프 적립에
 * 실패한 학생도 DB 에는 흔적이 없다(실패는 행을 안 남긴다). 둘 다 GA4 에만 있다.
 *
 * 실패는 이유를 가리지 않고 센다 — 대부분 PIN 불일치(http_403 · invalid_pin)지만 network · server_error 도 섞인다.
 * 화면이 이유를 같이 보여 준다(storeMetrics.ts failReasonLabel). 영업이 매장에 연락하기 전에 이유부터 본다.
 *
 * 기기 단위·확정 테이블만 — appMetrics.ts 머리 주석의 규칙을 따른다. Next 에 의존하지 않는다(캐시는 라우트가 건다).
 */

export interface StoreActivityData {
  window: { from: string; to: string };
  /** restaurant_id → 칸. 이벤트가 하나도 없는 매장은 키가 없다 — 조회가 성공했으므로 0 이다. */
  stores: Record<string, StoreActivity>;
}

export type StoreActivityRead = { ok: true; data: StoreActivityData } | { ok: false; reason: "no_key" | "error"; detail?: string };

const dash = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const num = (v: unknown) => Number(v ?? 0);

export async function readStoreActivity(
  env: Record<string, string | undefined> = process.env,
  opts: { start: string; end: string }
): Promise<StoreActivityRead> {
  const client = clientFromEnv(env);
  if (!client) return { ok: false, reason: "no_key" };
  const { dataset, run } = client;
  const { start, end } = opts;
  if (start > end) return { ok: false, reason: "error", detail: `창이 거꾸로입니다 — ${start} > ${end}` };

  const S = (k: string) => `(SELECT value.string_value FROM UNNEST(event_params) WHERE key='${k}')`;
  const ANY = (k: string) => `(SELECT COALESCE(CAST(value.int_value AS STRING), value.string_value) FROM UNNEST(event_params) WHERE key='${k}')`;

  try {
    const rows = await run<{
      restaurant_id: string;
      detail_devices: number;
      failed_devices: number;
      coupon_failed: number;
      coupon_unresolved: number;
      stamp_failed: number;
      reasons: string[] | null;
    }>(
      `WITH ev AS (
         SELECT event_name, user_pseudo_id AS device, ${ANY("restaurant_id")} AS rid, ${S("coupon_code")} AS code, ${S("fail_reason")} AS reason
         FROM \`${dataset}.events_*\`
         WHERE _TABLE_SUFFIX BETWEEN @start AND @end
           AND event_name IN ('restaurant_detail_open', 'coupon_redeemed', 'coupon_redeem_failed', 'stamp_add_failed')
       ), used AS (
         -- 실패한 쿠폰이 결국 쓰였는지는 쿠폰 코드로 잇는다 — 어느 매장에서 쓰였든 그 쿠폰은 해결됐다
         SELECT DISTINCT code FROM ev WHERE event_name = 'coupon_redeemed' AND code IS NOT NULL
       )
       SELECT ev.rid AS restaurant_id,
         COUNT(DISTINCT IF(ev.event_name = 'restaurant_detail_open', ev.device, NULL)) AS detail_devices,
         COUNT(DISTINCT IF(ev.event_name IN ('coupon_redeem_failed', 'stamp_add_failed'), ev.device, NULL)) AS failed_devices,
         COUNTIF(ev.event_name = 'coupon_redeem_failed') AS coupon_failed,
         COUNT(DISTINCT IF(ev.event_name = 'coupon_redeem_failed' AND used.code IS NULL, ev.code, NULL)) AS coupon_unresolved,
         COUNTIF(ev.event_name = 'stamp_add_failed') AS stamp_failed,
         ARRAY_AGG(DISTINCT IF(ev.event_name IN ('coupon_redeem_failed', 'stamp_add_failed'), ev.reason, NULL) IGNORE NULLS) AS reasons
       FROM ev LEFT JOIN used ON used.code = ev.code
       WHERE ev.rid IS NOT NULL AND ev.event_name != 'coupon_redeemed'
       GROUP BY ev.rid`,
      { start, end }
    );

    const stores: Record<string, StoreActivity> = {};
    for (const r of rows) {
      stores[String(r.restaurant_id)] = {
        detail_devices: num(r.detail_devices),
        failed_devices: num(r.failed_devices),
        coupon_failed: num(r.coupon_failed),
        coupon_unresolved: num(r.coupon_unresolved),
        stamp_failed: num(r.stamp_failed),
        reasons: (r.reasons ?? []).slice().sort(),
      };
    }
    return { ok: true, data: { window: { from: dash(start), to: dash(end) }, stores } };
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message.slice(0, 160) : "알 수 없는 오류" };
  }
}
