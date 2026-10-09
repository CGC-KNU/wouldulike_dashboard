import { clientFromEnv, ISSUE_KEY_SOURCES, isCampaignSource } from "./appMetrics";

/**
 * 쿠폰 **발급 → 사용** 을 GA4 원본에서 제대로 센다.
 *
 * ── 왜 따로 만드는가 ──
 * 백엔드 app-stats 의 「발급 → 사용」 한 칸은 판정에 쓸 수 없다. 2026-09-01~21 실측으로 전체 3.2% 였는데,
 * 그 숫자는 사실상 **한 경로 얘기**였다 — 학생회 추천코드 쿠폰 489장 중 쓴 것이 1장(0.2%)이라 분모의 63%가
 * 그 경로였다. 나머지 291장은 24장이 쓰여 8.2% 다. 한 칸으로는 "쿠폰이 안 쓰인다"밖에 말할 수 없고 그건 틀렸다.
 *
 * ── 어떻게 가르는가 (판단이 아니라 규칙) ──
 * 앱이 붙이는 `coupon_issue_source` 는 `campaignCode ?? issue_key 매핑` 이다
 * (frontend coupon_service.dart `couponIssueSource`, backend `_issue_source` 가 같은 규칙).
 * 그래서 **값이 아래 ISSUE_KEY_SOURCES 에 없으면 캠페인 코드** 다 — 기획해서 뿌린 것.
 * 담당자의 취향이 아니라 코드가 이미 그어 둔 경계라, 새 캠페인이 생겨도 저절로 맞는 쪽에 들어간다.
 *
 * ── 발급↔사용을 코드로 잇는다 ──
 * `coupon_issued` · `coupon_redeemed` 둘 다 `coupon_code` 를 100% 싣는다(9월 780/780 · 25/25 실측).
 * 기기 단위로 "받은 사람이 뭔가를 썼다"를 세면 경로가 섞여 과대평가된다 — **그 쿠폰이 쓰였는지**로 센다.
 *
 * ── 진짜 병목은 발급이 아니라 그다음이다 ──
 * 9월 기기 단위: 받음 220 → 쿠폰함 209(95%) → 사용 화면 75(36%) → 시도 29 → 성공 21 · 실패 11.
 * 쿠폰함까지는 거의 다 온다. 무너지는 곳은 「쿠폰함 → 사용 화면」이고 지금 지표에 그 칸이 없었다.
 * 실패 15건 중 12건은 `fail_reason=http_403` = 매장 PIN 불일치(backend RedeemView 의 "invalid merchant").
 */

const MAX_BYTES = String(1024 ** 3);

// 목록 자체는 appMetrics.ts 에 있다 — 그 파일의 퍼널 SQL 도 같은 목록을 써야 하는데,
// 이 파일이 appMetrics 를 가져오므로 거꾸로 가져오면 순환 참조가 된다.
// 기존 import 경로(`from "./couponFunnel"`)가 깨지지 않게 여기서 다시 내보낸다.
export { ISSUE_KEY_SOURCES, isCampaignSource } from "./appMetrics";

/**
 * 이벤트가 앱에 **처음 찍힌 날**(YYYYMMDD). 창이 이보다 앞서면 그 칸은 값이 아니라 **없던 것**이다.
 *
 * 2026-09-23 에 BigQuery 로 잰 값이다. 이게 없으면 8월 「쿠폰함 → 사용 화면」이 4.3% 로 나오고
 * 9월 36% 와 나란히 놓여 "8배 좋아졌다"로 읽힌다 — 실제로는 8월에 이벤트가 없었을 뿐이다(8월 4건 · 9월 147건).
 * 새 이벤트를 지표에 들일 때마다 여기 한 줄 추가한다. 재는 법:
 *   SELECT event_name, MIN(event_date) FROM `…events_*` WHERE … GROUP BY event_name
 */
export const EVENT_LIVE_FROM: Record<string, string> = {
  coupon_use_screen_view: "20260831",
  coupon_redeem_attempt: "20260831",
  coupon_redeem_failed: "20260907",
};

/** 창 전체가 이벤트가 살아 있던 뒤인가. 걸쳐 있으면 false — 값을 내되 「일부 기간만」이라고 알린다. */
export function eventCoverage(event: string, start: string, end: string): "full" | "partial" | "none" {
  const from = EVENT_LIVE_FROM[event];
  if (!from) return "full";
  if (end < from) return "none";
  return start >= from ? "full" : "partial";
}

export interface SourceRow {
  source: string;
  /** 기획전으로 뿌린 캠페인 쿠폰인가 */
  campaign: boolean;
  issued: number;
  /** 그 쿠폰이 실제로 쓰인 수 (coupon_code 로 이은 것) */
  redeemed: number;
}

export interface CouponFunnel {
  window: { from: string; to: string };
  bySource: SourceRow[];
  /** 기획전으로 뿌린 쿠폰 */
  campaign: { issued: number; redeemed: number; rate: number | null };
  /** 그 외 — 가입 환영·스탬프 보상·추천·한정 등 */
  organic: { issued: number; redeemed: number; rate: number | null };
  /** 쿠폰함을 본 기기 중 사용 화면까지 간 비율 */
  wallet: { saw: number; opened_use: number; rate: number | null };
  /**
   * 사용 시도의 결과. `rate` 의 분모는 **성공+실패**다 — `coupon_redeem_attempt` 는 8/31 에 생긴 이벤트라
   * 옛 버전 앱에서는 안 찍혀, 시도를 분모로 쓰면 8월에 성공 3 / 시도 2 = 150% 같은 값이 나온다.
   */
  attempt: { attempts: number; ok: number; failed: number; rate: number | null; reasons: { reason: string; n: number }[] };
  /** PIN 이 안 맞은 매장 — 지표가 아니라 오늘 연락할 곳 */
  pinFailStores: { restaurant_id: string; n: number }[];
  /** 창이 이벤트 생일보다 앞서는 칸 — 부르는 쪽이 값을 비우거나 「일부 기간만」을 붙인다 */
  coverage: { wallet_to_use: "full" | "partial" | "none"; redeem_outcome: "full" | "partial" | "none" };
}

export type CouponFunnelRead =
  | { ok: true; data: CouponFunnel }
  | { ok: false; reason: "no_key" | "error"; detail?: string };

const dash = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

/**
 * 쿠폰 한 장의 발급 경로(SQL 집계식). 같은 쿠폰이 이벤트마다 다른 경로로 찍히는 일이 있다 —
 * 대개 한 번은 캠페인 코드, 한 번은 `other` 다(1010 실측). `ANY_VALUE` 로 고르면 실행할 때마다
 * 캠페인/그 외가 바뀌어 같은 달을 두 번 뽑아도 숫자가 다르다. **구체적인 경로를 먼저** 고르고
 * (`other`·`unknown` 은 매핑이 없을 때 붙는 대체값), 그 안에서는 MIN 으로 늘 같은 것을 고른다.
 */
const pickSource = (expr: string) =>
  `IFNULL(MIN(IF(${expr} NOT IN ('other', 'unknown'), ${expr}, NULL)), IFNULL(MIN(${expr}), 'unknown'))`;

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const num = (v: unknown) => Number(v ?? 0);

export async function readCouponFunnel(
  env: Record<string, string | undefined> = process.env,
  opts: { start: string; end: string }
): Promise<CouponFunnelRead> {
  const client = clientFromEnv(env);
  if (!client) return { ok: false, reason: "no_key" };
  const { dataset, run } = client;
  const { start, end } = opts;
  if (start > end) return { ok: false, reason: "error", detail: `창이 거꾸로입니다 — ${start} > ${end}` };

  const events = `\`${dataset}.events_*\``;
  const S = (k: string) => `(SELECT value.string_value FROM UNNEST(event_params) WHERE key='${k}')`;
  const ANY = (k: string) => `(SELECT COALESCE(CAST(value.int_value AS STRING), value.string_value) FROM UNNEST(event_params) WHERE key='${k}')`;

  try {
    // 네 쿼리는 서로 독립이라 같이 쏜다 — 보고서 한 장이 창 두 개를 읽으므로 순차로 두면 벽시계가 배가 된다.
    // ① 경로별 발급 · 그 쿠폰이 쓰였는지 — coupon_code 로 잇는다(기기 단위로 세면 경로가 섞인다)
    const rowsP = run<{ source: string | null; issued: number; redeemed: number }>(
      `WITH iss AS (
         SELECT ${S("coupon_code")} AS code, ${pickSource(S("coupon_issue_source"))} AS source
         FROM ${events}
         WHERE _TABLE_SUFFIX BETWEEN @start AND @end AND event_name = 'coupon_issued'
           AND ${S("coupon_code")} IS NOT NULL
         GROUP BY code
       ), red AS (
         SELECT DISTINCT ${S("coupon_code")} AS code FROM ${events}
         WHERE _TABLE_SUFFIX BETWEEN @start AND @end AND event_name = 'coupon_redeemed'
           AND ${S("coupon_code")} IS NOT NULL
       )
       SELECT IFNULL(i.source, 'unknown') AS source,
              COUNT(*) AS issued,
              COUNTIF(r.code IS NOT NULL) AS redeemed
       FROM iss i LEFT JOIN red r USING (code)
       GROUP BY source ORDER BY issued DESC`,
      { start, end }
    );

    // ② 쿠폰함 → 사용 화면 (기기 단위) · ③ 사용 시도 성공률 (건 단위)
    const funnelP = run<{ saw: number; opened_use: number; attempts: number; ok: number; failed: number }>(
      `SELECT
         COUNT(DISTINCT IF(event_name = 'coupon_page_view', user_pseudo_id, NULL)) AS saw,
         COUNT(DISTINCT IF(event_name = 'coupon_use_screen_view', user_pseudo_id, NULL)) AS opened_use,
         COUNTIF(event_name = 'coupon_redeem_attempt') AS attempts,
         COUNTIF(event_name = 'coupon_redeemed') AS ok,
         COUNTIF(event_name = 'coupon_redeem_failed') AS failed
       FROM ${events}
       WHERE _TABLE_SUFFIX BETWEEN @start AND @end
         AND event_name IN ('coupon_page_view', 'coupon_use_screen_view', 'coupon_redeem_attempt', 'coupon_redeemed', 'coupon_redeem_failed')`,
      { start, end }
    );

    // ④ 실패 이유 · ⑤ PIN 이 안 맞은 매장
    const reasonsP = run<{ reason: string | null; n: number }>(
      `SELECT ${S("fail_reason")} AS reason, COUNT(*) AS n FROM ${events}
       WHERE _TABLE_SUFFIX BETWEEN @start AND @end AND event_name = 'coupon_redeem_failed'
       GROUP BY reason ORDER BY n DESC`,
      { start, end }
    );
    const storesP = run<{ restaurant_id: string | null; n: number }>(
      `SELECT ${ANY("restaurant_id")} AS restaurant_id, COUNT(*) AS n FROM ${events}
       WHERE _TABLE_SUFFIX BETWEEN @start AND @end AND event_name = 'coupon_redeem_failed'
         AND ${S("fail_reason")} = 'http_403'
       GROUP BY restaurant_id ORDER BY n DESC LIMIT 5`,
      { start, end }
    );

    const [rows, funnelRows, reasons, stores] = await Promise.all([rowsP, funnelP, reasonsP, storesP]);
    const funnel = funnelRows[0];

    const bySource: SourceRow[] = rows.map((r) => {
      const source = r.source ?? "unknown";
      return { source, campaign: isCampaignSource(source), issued: num(r.issued), redeemed: num(r.redeemed) };
    });
    const sum = (keep: (r: SourceRow) => boolean) =>
      bySource.filter(keep).reduce((a, r) => ({ issued: a.issued + r.issued, redeemed: a.redeemed + r.redeemed }), { issued: 0, redeemed: 0 });
    const camp = sum((r) => r.campaign);
    const org = sum((r) => !r.campaign);

    const saw = num(funnel?.saw);
    const attempts = num(funnel?.attempts);
    return {
      ok: true,
      data: {
        window: { from: dash(start), to: dash(end) },
        bySource,
        campaign: { ...camp, rate: pct(camp.redeemed, camp.issued) },
        organic: { ...org, rate: pct(org.redeemed, org.issued) },
        wallet: { saw, opened_use: num(funnel?.opened_use), rate: pct(num(funnel?.opened_use), saw) },
        attempt: {
          attempts, ok: num(funnel?.ok), failed: num(funnel?.failed),
          // 분모는 시도가 아니라 **결과**(성공+실패). 시도 이벤트는 8/31 에 생겨 옛 버전에서 안 찍힌다.
          rate: pct(num(funnel?.ok), num(funnel?.ok) + num(funnel?.failed)),
          reasons: reasons.map((r) => ({ reason: r.reason ?? "(없음)", n: num(r.n) })).filter((r) => r.n > 0),
        },
        pinFailStores: stores.filter((r) => r.restaurant_id).map((r) => ({ restaurant_id: r.restaurant_id as string, n: num(r.n) })),
        coverage: {
          wallet_to_use: eventCoverage("coupon_use_screen_view", start, end),
          // 실패 이벤트가 더 늦게(9/7) 생겨서 둘 중 늦은 쪽을 따른다
          redeem_outcome: eventCoverage("coupon_redeem_failed", start, end),
        },
      },
    };
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message.slice(0, 160) : "알 수 없는 오류" };
  }
}

/**
 * 지표 줄에 붙일 「경로: A 12.3% · B 4.5%」 — 발급 10장 미만은 뺀다(비율이 뜻이 없다).
 * `only` 로 캠페인/그 외 한쪽만 고를 수 있다 — 캠페인 칸의 주석에 캠페인 아닌 경로가 섞이면 안 된다.
 */
export function sourceRateNote(f: CouponFunnel, limit = 4, only?: "campaign" | "organic"): string {
  const rows = f.bySource
    .filter((r) => (only === "campaign" ? r.campaign : only === "organic" ? !r.campaign : true))
    .filter((r) => r.issued >= 10)
    .slice(0, limit);
  if (!rows.length) return "";
  return rows.map((r) => `${r.source} ${r.issued}장 중 ${r.redeemed}장(${pct(r.redeemed, r.issued) ?? 0}%)`).join(" · ");
}

/** 한 경로가 발급의 이만큼을 넘으면 전체 비율은 사실상 그 경로 얘기다 */
export const DOMINANT_SHARE = 0.5;
export function dominantSource(f: CouponFunnel): SourceRow | null {
  const total = f.bySource.reduce((a, r) => a + r.issued, 0);
  const top = f.bySource[0];
  return top && total > 0 && top.issued / total >= DOMINANT_SHARE ? top : null;
}

// ── 매장 상세 → 그 매장 쿠폰 받기 ─────────────────────────────────────
/**
 * Probe 앱 지표의 「매장 상세 → 쿠폰 발급」 칸.
 *
 * 그동안 이 칸은 "분모(매장 상세 열람)는 앱 이벤트이고 발급은 DB 라 합쳐야 한다"는 이유로 비어 있었다.
 * **틀린 전제였다.** `restaurant_detail_open` 과 `coupon_issued` 둘 다 `restaurant_id` 를 싣고 있어서,
 * (기기 · ga_session_id · restaurant_id) 로 GA4 안에서 그대로 이어진다 — DB 가 필요 없다.
 *
 * ── 캠페인 자동 지급은 분자에서 뺀다 ──
 * `coupon_issued` 는 지갑 목록 diff 로 찍혀서, 기획전 쿠폰이 그 세션에 **화면에 보이기만 해도** 잡힌다.
 * 그건 매장 상세를 본 것과 아무 상관이 없다. 실측(2026-08-25~09-22):
 *   · 아무 쿠폰이나 세면   상세 520 → 50   (9.6%)
 *   · 캠페인 지급을 빼면   상세 520 → 18   (3.5%)
 * 섞어서 9.6% 로 내보내면 "상세를 보면 10%가 쿠폰을 받는다"로 읽힌다 — 사실이 아니다.
 * 가르는 기준은 `isCampaignSource` 와 같다(코드가 이미 그어 둔 경계).
 *
 * 표본이 얕다. 7일 창에서는 분자가 한 자리다 — 부르는 쪽이 건수를 같이 적어야 한다.
 */
export interface StoreToCoupon {
  window: { from: string; to: string };
  /** 매장 상세를 연 (기기·세션·매장) 조합 수 — 분모 */
  views: number;
  /** 그중 같은 자리에서 **캠페인이 아닌** 쿠폰을 받은 수 — 분자 */
  claimed: number;
  /** 캠페인까지 포함하면 몇 건인지 — 주석에 같이 적으려고 준다 */
  claimed_including_campaign: number;
  rate: number | null;
}

export async function readStoreToCoupon(
  env: Record<string, string | undefined> = process.env,
  opts: { start: string; end: string }
): Promise<{ ok: true; data: StoreToCoupon } | { ok: false; reason: "no_key" | "error"; detail?: string }> {
  const client = clientFromEnv(env);
  if (!client) return { ok: false, reason: "no_key" };
  const { dataset, run } = client;
  const { start, end } = opts;
  if (start > end) return { ok: false, reason: "error", detail: `창이 거꾸로입니다 — ${start} > ${end}` };

  const events = `\`${dataset}.events_*\``;
  const rid = `(SELECT COALESCE(CAST(value.int_value AS STRING), value.string_value) FROM UNNEST(event_params) WHERE key='restaurant_id')`;
  const src = `(SELECT value.string_value FROM UNNEST(event_params) WHERE key='coupon_issue_source')`;
  const sess = `(SELECT value.int_value FROM UNNEST(event_params) WHERE key='ga_session_id')`;
  const known = [...ISSUE_KEY_SOURCES].map((s) => `'${s}'`).join(",");

  try {
    const [r] = await run<{ views: number; claimed: number; any_claimed: number }>(
      `WITH d AS (
         SELECT DISTINCT user_pseudo_id uid, ${sess} sess, ${rid} rid FROM ${events}
         WHERE _TABLE_SUFFIX BETWEEN @start AND @end AND event_name = 'restaurant_detail_open' AND ${rid} IS NOT NULL
       ), any_c AS (
         SELECT DISTINCT user_pseudo_id uid, ${sess} sess, ${rid} rid FROM ${events}
         WHERE _TABLE_SUFFIX BETWEEN @start AND @end AND event_name = 'coupon_issued'
       ), organic AS (
         SELECT DISTINCT user_pseudo_id uid, ${sess} sess, ${rid} rid FROM ${events}
         WHERE _TABLE_SUFFIX BETWEEN @start AND @end AND event_name = 'coupon_issued'
           AND ${src} IN (${known})
       )
       SELECT COUNT(*) AS views,
              COUNTIF(o.uid IS NOT NULL) AS claimed,
              COUNTIF(a.uid IS NOT NULL) AS any_claimed
       FROM d LEFT JOIN any_c a USING (uid, sess, rid) LEFT JOIN organic o USING (uid, sess, rid)`,
      { start, end }
    );
    const views = Number(r?.views ?? 0);
    const claimed = Number(r?.claimed ?? 0);
    return {
      ok: true,
      data: {
        window: { from: dash(start), to: dash(end) },
        views, claimed,
        claimed_including_campaign: Number(r?.any_claimed ?? 0),
        rate: pct(claimed, views),
      },
    };
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message.slice(0, 160) : "알 수 없는 오류" };
  }
}

// ── 쓰기 퍼널 — 받은 쿠폰 한 장을 끝까지 따라간다 ──────────────────────────
/**
 * 보고서 「쓰기 퍼널」(민찬 1010). 받은 쿠폰 → 사용 화면 → 사용 시도 → 사용 을 **쿠폰 한 장 단위**로 센다.
 *
 * ── 왜 퍼널을 둘로 나눴나 ──
 * 찾기 퍼널(앱 열기 → 매장 상세 → 쿠폰 발급)은 세션 단위다. 쿠폰은 받은 세션이 아니라 **나중 방문에서**
 * 쓰이므로 그 퍼널의 4단 「쿠폰 사용」은 세션으로 이을 수 없어 「끊김」으로 비워 두었다.
 * 단위를 쿠폰 한 장으로 바꾸면 끊기지 않는다 — 사용 화면 · 사용 시도 · 사용 이벤트가 모두 `coupon_code` 를
 * 싣고 있어서(1010 확인) 받은 뒤 며칠이 지나 다른 세션에서 써도 같은 쿠폰으로 이어진다.
 *
 * ── 발급 뒤 며칠까지 보나 ──
 * 각 쿠폰을 **발급 시각부터 7일**만 따라간다. 창 끝에 받은 쿠폰이 쓸 시간이 짧아 낮게 나오는 일을 막는다.
 * 1010 실측으로 쓰인 쿠폰은 모두 발급 14일 안, 대부분 7일 안에 쓰였다. 확정 테이블이 발급 + 7일까지 아직
 * 없는 쿠폰은 `maturing` 으로 센다 — 부르는 쪽이 「아직 지켜보는 중」이라고 적는다.
 *
 * ── 「받은 쿠폰」은 그 창에 **처음** 받은 쿠폰이다 ──
 * `coupon_issued` 는 지갑 목록 diff 로 찍혀서, 재설치하거나 다른 기기로 로그인하면 예전에 받은 쿠폰에도 다시 찍힌다
 * (1010 실측 — 한 주의 발급 절반 가까이가 그런 주도 있었다). 그대로 세면 옛 쿠폰이 새로 받은 것처럼 들어오고 7일 창도
 * 다시 보인 날부터 잡힌다. 그래서 창 앞 90일(LOOKBACK_DAYS)을 거슬러 보고 그 전에 받은 쿠폰은 뺀다.
 *
 * ── 단계가 역전되지 않게 ──
 * 뒤 단계에 간 쿠폰은 앞 단계도 지난 것으로 센다(`screen OR attempt OR redeemed`). 1010 실측으로는 쓰인 쿠폰이
 * 모두 사용 화면과 사용 시도 이벤트를 거쳤지만, 옛 앱이 앞 이벤트를 빠뜨려도 퍼널이 거꾸로 서지 않게 한다.
 */
export const FOLLOW_DAYS = 7;
/** 창보다 앞서 받은 쿠폰을 거르려고 거슬러 보는 날 수 — 거슬러 읽어도 쿼리 하나에 십몇 MB 다(1010) */
export const LOOKBACK_DAYS = 90;

export interface UseFunnelLine {
  /** 창 안에 받은 쿠폰 */
  issued: number;
  /** 발급 뒤 7일 안에 사용 화면을 연 쿠폰(뒤 단계에 간 쿠폰 포함) */
  screen: number;
  /** 사용을 시도한 쿠폰(쓰인 쿠폰 포함) */
  attempt: number;
  /** 발급 뒤 7일 안에 쓰인 쿠폰 */
  redeemed: number;
  /** 시도했지만 7일 안에 못 쓴 쿠폰 중 PIN 불일치(http_403)로 실패한 적이 있는 쿠폰 */
  pin_failed: number;
}

export interface CouponUseFunnel {
  /** 발급 창 */
  window: { from: string; to: string };
  followDays: number;
  /** 발급 + 7일까지 확정 테이블이 아직 없는 쿠폰 — 「사용」이 낮게 나올 수 있다 */
  maturing: number;
  /** 가입 환영·스탬프 보상·추천·한정 등 */
  organic: UseFunnelLine;
  /** 기획전으로 뿌린 쿠폰 */
  campaign: UseFunnelLine;
  /**
   * steps — 사용 화면·사용 시도 이벤트가 발급 창 전체에 있었나. 아니면 가운데 두 단계를 비운다.
   * failures — 실패 이벤트(9/7~)가 있었나. 아니면 PIN 불일치를 말하지 않는다.
   */
  coverage: { steps: "full" | "partial" | "none"; failures: "full" | "partial" | "none" };
}

const ORDER = { none: 0, partial: 1, full: 2 } as const;
const worse = (a: "full" | "partial" | "none", b: "full" | "partial" | "none") => (ORDER[a] <= ORDER[b] ? a : b);

export async function readCouponUseFunnel(
  env: Record<string, string | undefined> = process.env,
  opts: { start: string; end: string; through?: string | null }
): Promise<{ ok: true; data: CouponUseFunnel } | { ok: false; reason: "no_key" | "error"; detail?: string }> {
  const client = clientFromEnv(env);
  if (!client) return { ok: false, reason: "no_key" };
  const { dataset, run } = client;
  const { start, end } = opts;
  if (start > end) return { ok: false, reason: "error", detail: `창이 거꾸로입니다 — ${start} > ${end}` };

  const shiftYmd = (s: string, days: number) =>
    new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8) + days)).toISOString().slice(0, 10).replace(/-/g, "");
  // 발급 뒤 7일까지 읽되, 확정 테이블이 없는 날은 읽지 않는다 — 없는 날은 「지켜보는 중」으로 센다
  const shifted = shiftYmd(end, FOLLOW_DAYS);
  const through = opts.through ?? shifted;
  const followEnd = through < shifted ? through : shifted;
  const lookback = shiftYmd(start, -LOOKBACK_DAYS);

  const events = `\`${dataset}.events_*\``;
  const S = (k: string) => `(SELECT value.string_value FROM UNNEST(event_params) WHERE key='${k}')`;

  try {
    const rows = await run<{ source: string; issued: number; screen: number; attempt: number; redeemed: number; pin_failed: number; maturing: number }>(
      `WITH first_seen AS (
         SELECT ${S("coupon_code")} AS code, MIN(event_timestamp) AS t, MIN(event_date) AS d,
                ${pickSource(S("coupon_issue_source"))} AS source
         FROM ${events}
         WHERE _TABLE_SUFFIX BETWEEN @lookback AND @end AND event_name = 'coupon_issued'
           AND ${S("coupon_code")} IS NOT NULL
         GROUP BY code
       ), iss AS (
         -- 창 앞에서 이미 받은 쿠폰은 뺀다 — 재설치·다른 기기에서 다시 보인 것이다
         SELECT * FROM first_seen WHERE d >= @start
       ), ev AS (
         SELECT ${S("coupon_code")} AS code, event_name, event_timestamp AS t, ${S("fail_reason")} AS reason
         FROM ${events}
         WHERE _TABLE_SUFFIX BETWEEN @start AND @followEnd
           AND event_name IN ('coupon_use_screen_view', 'coupon_redeem_attempt', 'coupon_redeemed', 'coupon_redeem_failed')
           AND ${S("coupon_code")} IS NOT NULL
       ), per AS (
         SELECT i.code, i.source,
                FORMAT_DATE('%Y%m%d', DATE_ADD(PARSE_DATE('%Y%m%d', i.d), INTERVAL ${FOLLOW_DAYS} DAY)) > @through AS maturing,
                LOGICAL_OR(e.event_name = 'coupon_use_screen_view') AS screen,
                LOGICAL_OR(e.event_name = 'coupon_redeem_attempt') AS attempt,
                LOGICAL_OR(e.event_name = 'coupon_redeemed') AS redeemed,
                LOGICAL_OR(e.event_name = 'coupon_redeem_failed' AND e.reason = 'http_403') AS pin
         FROM iss i LEFT JOIN ev e
           ON e.code = i.code AND e.t >= i.t AND e.t < i.t + ${FOLLOW_DAYS} * 86400 * 1000000
         GROUP BY i.code, i.source, i.d
       )
       SELECT source,
              COUNT(*) AS issued,
              COUNTIF(screen OR attempt OR redeemed) AS screen,
              COUNTIF(attempt OR redeemed) AS attempt,
              COUNTIF(redeemed) AS redeemed,
              COUNTIF(pin AND NOT redeemed) AS pin_failed,
              COUNTIF(maturing) AS maturing
       FROM per GROUP BY source`,
      { start, end, lookback, followEnd, through }
    );

    const zero = (): UseFunnelLine => ({ issued: 0, screen: 0, attempt: 0, redeemed: 0, pin_failed: 0 });
    const organic = zero(), campaign = zero();
    let maturing = 0;
    for (const r of rows) {
      const line = isCampaignSource(r.source ?? "unknown") ? campaign : organic;
      line.issued += num(r.issued);
      line.screen += num(r.screen);
      line.attempt += num(r.attempt);
      line.redeemed += num(r.redeemed);
      line.pin_failed += num(r.pin_failed);
      maturing += num(r.maturing);
    }
    return {
      ok: true,
      data: {
        window: { from: dash(start), to: dash(end) },
        followDays: FOLLOW_DAYS,
        maturing,
        organic,
        campaign,
        coverage: {
          steps: worse(eventCoverage("coupon_use_screen_view", start, end), eventCoverage("coupon_redeem_attempt", start, end)),
          failures: eventCoverage("coupon_redeem_failed", start, end),
        },
      },
    };
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message.slice(0, 160) : "알 수 없는 오류" };
  }
}
