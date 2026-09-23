import type { Ga4AppMetrics } from "@/lib/bigquery/appMetrics";
import { dominantSource, sourceRateNote, type CouponFunnel } from "@/lib/bigquery/couponFunnel";
import APP_REPORT_TEMPLATE_HTML from "./appReportTemplateHtml";

/**
 * Probe · 앱 지표 **주간 보고서**의 데이터 변환 — 읽어 온 숫자를 양식(templates/app-report-template.html)의
 * `report-data` JSON 으로 바꾼다. 여기는 **순수 함수만** 둔다(가져오기는 appReport.ts) — 그래야 테스트가 돈다.
 *
 * 양식이 계산·문장·숨김을 다 한다. 여기서는 **원본 숫자만** 옮긴다. 없는 칸은 0 으로 채우지 않고
 * 왜 없는지(status)를 적어 양식이 「연결 전 · 앱 수정 대기 · 정의 보류」로 그리게 둔다.
 *
 * ── 주간으로 쪼갤 수 있는 칸과 아닌 칸 ──
 * GA4·Firebase 칸은 기간 쿼리라 그 주만 셀 수 있다 — 지난주와 그 전주를 **같은 정의로** 뽑아 전주 대비를 낸다.
 * 백엔드 `/api/dashboard/admin/app-stats/` 는 기간 파라미터가 없어 **KST 이번 달 누계**만 준다. 그 칸들은
 * `scope: "month_to_date"` 를 달아 내보낸다 — 양식이 「이번 달 누계」 배지를 붙이고 증감칩을 아예 안 그린다.
 * 이걸 빠뜨리면 월 누계가 주간 수치처럼 읽힌다(양식 머리말이 "가장 큰 사고"라고 적어 둔 것).
 */

/** 양식의 진짜 <body>. 머리말 주석 안에도 비슷한 글자가 있어 태그 전체로 찾는다. embed 스크립트가 같은 값을 검사한다. */
export const APP_BODY_TAG = '<body data-report-status="ok">';

/** 표본이 이보다 적으면 증감을 붙이지 않는다 — 양식의 SMALL_SAMPLE 과 같은 값. */
export const SMALL_SAMPLE = 30;

export type Json = Record<string, unknown>;
type Num = number | null;

export interface AppStats {
  stats?: Record<string, number | null> | null;
  since?: string;
  coupon_by_source?: Record<string, { issued: number; redeemed: number; expiring?: number; label?: string }> | null;
}

export interface Metric {
  key: string;
  label: string;
  value: Num;
  prev?: Num;
  unit?: string;
  source: "backend" | "push" | "ga4" | "firebase";
  status?: "connected" | "app_fix" | "pending" | "undefined";
  scope?: "period" | "month_to_date";
  sample?: number;
  note?: string;
  verdict?: "good" | "warn" | "flat";
}

// ── 날짜 ──────────────────────────────────────────────────────────
const utc = (s: string) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const bare = (s: string) => s.replace(/-/g, "");
const dash = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const md = (s: string) => `${+s.slice(4, 6)}/${+s.slice(6, 8)}`;
export function shiftDay(s: string, days: number): string {
  const d = utc(s);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * `last`(YYYYMMDD) 이하의 가장 최근 **일요일** — 마지막으로 다 끝난 월~일 주다.
 * 확정 테이블이 9/21(월)까지 있어도 그 주는 아직 하루치라, 보고서는 9/14~9/20 을 낸다.
 */
export function lastCompleteWeekEnd(last: string): string {
  return shiftDay(last, -utc(last).getUTCDay());
}

/** 아무 날짜나 그 주의 일요일로 맞춘다 — 화면이 월요일을 줘도 같은 주를 가리키게. */
export function normalizeWeekEnd(input: string): string | null {
  const t = bare(input);
  if (!/^\d{8}$/.test(t)) return null;
  const d = utc(t);
  if (Number.isNaN(d.getTime()) || ymd(d) !== t) return null;
  return d.getUTCDay() === 0 ? t : shiftDay(t, 7 - d.getUTCDay());
}

/** "9월 3주차" — 그 주 일요일이 속한 달에서 몇 번째 주인가. 1~7일은 1주차, 8~14일은 2주차… */
export function weekLabel(end: string): string {
  return `${+end.slice(4, 6)}월 ${Math.ceil(+end.slice(6, 8) / 7)}주차`;
}

/** "9/14(월)~9/20(일)" — 미리보기 띠에 쓴다. */
export function weekRangeLabel(start: string, end: string): string {
  const s = bare(start);
  const e = bare(end);
  return `${md(s)}(${DOW[utc(s).getUTCDay()]})~${md(e)}(${DOW[utc(e).getUTCDay()]})`;
}

// ── 숫자 ──────────────────────────────────────────────────────────
/**
 * 표본이 얕으면 `prev` 를 떼고 내보낸다. 양식은 표본 30 미만에 증감이 붙으면 경고를 남기고,
 * 무엇보다 19대짜리 비율의 전주 대비는 읽는 사람을 잘못 이끈다.
 */
function prevIf(prev: Num, sample?: number): Num | undefined {
  if (prev === null || prev === undefined) return undefined;
  if (sample !== undefined && sample < SMALL_SAMPLE) return undefined;
  return prev;
}

/**
 * 분모가 반 이상 달라진 주의 비율 지표는 판정을 유보한다.
 * 유입이 3.7배가 된 주에 DAU/WAU 가 0.8%p 내려간 것을 빨갛게 칠하면 "같은 사람들이 덜 왔다"로 읽힌다.
 * 숫자는 그대로 두고 색만 중립으로 바꾼다(양식의 verdict "flat" = 판정 유보).
 */
function verdictForRatio(curBase: Num, prevBase: Num): "flat" | undefined {
  if (!curBase || !prevBase) return undefined;
  return Math.abs(curBase - prevBase) / prevBase >= 0.5 ? "flat" : undefined;
}

/** dbMetric 이 비워 두는 단위를 한 번에 채운다 */
const UNIT: Record<string, string> = {
  signups_month: "명", coupon_issued: "건", coupon_used: "건", coupon_expiring: "장", coupon_rate: "%",
  stamp_earned: "건", stamp_reward: "건", mileage_entries: "건", mileage_winners: "건", push_sent: "건",
};

export interface AppReportInput {
  /** 그 주 일요일 (YYYYMMDD) */
  end: string;
  cur: Ga4AppMetrics | null;
  prev: Ga4AppMetrics | null;
  stats: AppStats | null;
  /** 작성일(KST, YYYY-MM-DD). 안 주면 오늘. */
  today?: string;
  /** 쿠폰 발급→사용 (GA4). DB 칸과 달리 주간에서도 기간이 정확하다. 없으면 그 네 칸이 「연결 전」이 된다. */
  coupons?: CouponFunnel | null;
  couponsPrev?: CouponFunnel | null;
}

// ── 본체 ──────────────────────────────────────────────────────────
export function buildAppReportData({ end, cur: g, prev: p, stats, today, coupons, couponsPrev }: AppReportInput): Json {
  const start = shiftDay(end, -6);
  const prevEnd = shiftDay(end, -7);

  const s = stats?.stats ?? null;
  const n = (k: string) => (s && typeof s[k] === "number" ? (s[k] as number) : null);
  const sum = (...ks: string[]) => (ks.every((k) => n(k) === null) ? null : ks.reduce((a, k) => a + (n(k) ?? 0), 0));

  const monthLabel = stats?.since ? `${+stats.since.slice(5, 7)}월` : "이번 달";
  const win = `${md(start)}~${md(end)}`;

  /** DB·푸시 칸 — 값이 있으면 반드시 month_to_date 를 달고, 없으면 왜 없는지를 단다. */
  const dbMetric = (key: string, label: string, value: Num, note?: string): Metric => ({
    // 한 경로가 발급의 절반을 넘으면 「발급 → 사용」은 그 경로 얘기라 색을 중립으로 둔다
    ...(key === "coupon_rate" && dom.verdict ? { verdict: dom.verdict } : {}),
    key,
    label,
    value,
    unit: UNIT[key],
    source: key === "push_sent" ? "push" : "backend",
    scope: "month_to_date",
    ...(value === null ? { status: "pending" as const } : {}),
    ...(note ? { note } : {}),
  });

  const newDev = g?.new_devices ?? null;
  const wauNote = g
    ? newDev !== null && g.wau
      ? `${win} 앱을 켠 기기 ${g.wau.toLocaleString()}대 중 ${newDev.toLocaleString()}대가 이번 주에 처음 연 기기입니다. 재설치하면 새로 셉니다`
      : `${win} 앱을 켠 기기 수. 재설치하면 새로 셉니다`
    : "최근 7일 고유 사용자 — BigQuery 를 읽지 못했습니다";

  const retSample = g?.cohort.users;
  const pushSample = g?.push.received;
  const banSample = g?.banner.clicked;
  const ratioVerdict = verdictForRatio(g?.wau ?? null, p?.wau ?? null);
  const dom = dominantNote(coupons ?? null);

  const groups = [
    {
      key: "usage",
      title: "앱 이용",
      description: "얼마나 많은 학생이 앱을 켜고, 돌아오는가.",
      metrics: [
        { key: "wau", label: "주간 활성(WAU)", value: g?.wau ?? null, prev: prevIf(p?.wau ?? null), unit: "명", source: "ga4", note: wauNote, ...(g ? {} : { status: "pending" as const }) },
        {
          key: "dau_wau", label: "DAU/WAU", value: g?.dau_wau ?? null, prev: prevIf(p?.dau_wau ?? null), unit: "%", source: "ga4",
          ...(ratioVerdict ? { verdict: ratioVerdict } : {}),
          note: "끈적함. 20% 넘으면 습관이 붙은 것" + (ratioVerdict ? ` — 분모(WAU)가 ${p?.wau?.toLocaleString()} → ${g?.wau?.toLocaleString()} 으로 크게 달라져 전주와 같은 조건이 아닙니다` : ""),
          ...(g ? {} : { status: "pending" as const }),
        },
        {
          key: "retention_w1", label: "가입 1주 후 복귀", value: g?.retention_w1 ?? null, prev: prevIf(p?.retention_w1 ?? null, retSample), unit: "%", source: "firebase",
          ...(retSample !== undefined ? { sample: retSample } : {}),
          note: g ? `${md(bare(g.cohort.from))}~${md(bare(g.cohort.to))} 첫 실행 ${g.cohort.users.toLocaleString()}대 중 7~13일째 다시 켠 비율` : "first_open 코호트의 7일 뒤 재방문",
          ...(g ? {} : { status: "pending" as const }),
        },
        dbMetric("signups_month", "가입", n("signups_this_month"), `${monthLabel} 새로 만든 계정`),
      ] as Metric[],
    },
    {
      key: "funnel",
      title: "전환 퍼널",
      description: "앱을 켠 사람이 실제로 매장에서 쓰기까지.",
      metrics: [
        {
          key: "open_to_store", label: "앱 열기 → 매장 상세", value: g?.open_to_store ?? null, prev: prevIf(p?.open_to_store ?? null), unit: "%", source: "ga4",
          note: g ? `${win} 세션 ${g.sessions.toLocaleString()}개 중 매장 상세를 연 비율` : "같은 세션 안 매장 상세 이벤트 유무",
          ...(g ? {} : { status: "pending" as const }),
        },
        { key: "store_to_coupon", label: "매장 상세 → 쿠폰 발급", value: null, unit: "%", source: "backend", status: "undefined", note: "앱의 coupon_issued 는 자동 지급 쿠폰이 화면에 보일 때도 남아 매장을 보고 받은 쿠폰과 섞입니다 — 정의 보류" },
        dbMetric("coupon_issued", "쿠폰 발급", n("coupon_issued_this_month")),
        dbMetric("coupon_used", "쿠폰 사용", n("coupon_redeemed_this_month")),
        // 이 칸만은 누계가 아니라 읽는 시점 기준 앞으로 7일이다 — 월 경계와 상관이 없어 scope 를 period 로 되돌린다.
        { ...dbMetric("coupon_expiring", "7일 안에 만료", n("coupon_expiring_7d"), "아직 안 쓴 쿠폰. 이 칸만은 누계가 아니라 읽는 시점 기준 앞으로 7일입니다"), scope: "period" as const },
        dbMetric("coupon_rate", "발급 → 사용", n("coupon_redeem_rate"), `${monthLabel} 발급분 중 이미 쓴 비율. 달 초엔 낮게 나옵니다${dom.extra}`),
        ...couponMetrics(coupons ?? null, couponsPrev ?? null),
      ] as Metric[],
    },
    {
      key: "loyalty",
      title: "스탬프 · 마일리지",
      description: "재방문 장치가 실제로 도는가.",
      metrics: [
        dbMetric("stamp_earned", "스탬프 적립", n("stamp_earned_this_month")),
        dbMetric("stamp_reward", "스탬프 보상 수령", n("stamp_reward_this_month"), "스탬프를 채워 발급된 보상 쿠폰"),
        dbMetric("mileage_entries", "마일리지 응모", n("mileage_entries_this_month")),
        dbMetric("mileage_winners", "당첨 · 교환", sum("mileage_winners_this_month", "mileage_exchanges_this_month"), `당첨 ${n("mileage_winners_this_month") ?? "-"} · 마일리지로 쿠폰 교환 ${n("mileage_exchanges_this_month") ?? "-"}. 월 발급 한도(재무 캡) 대비`),
      ] as Metric[],
    },
    {
      key: "push",
      title: "푸시 · 배너",
      description: "보낸 알림이 사람을 앱으로 데려오는가.",
      metrics: [
        {
          key: "push_open", label: "푸시 → 앱 열기", value: g?.push_open ?? null, prev: prevIf(p?.push_open ?? null, pushSample), unit: "%", source: "firebase",
          ...(pushSample !== undefined ? { sample: pushSample } : {}),
          note: g ? `${md(bare(g.push.from))}~${md(bare(g.push.to))} 안드로이드 수신 ${g.push.received.toLocaleString()}건 중 ${g.push.opened_android}건 열림 (iOS 는 수신을 못 세 열기 ${g.push.opened_ios}건만)` : "Firebase 자동 이벤트(notification_receive/open)",
          ...(g ? {} : { status: "pending" as const }),
        },
        {
          key: "banner_to_coupon", label: "배너 클릭 → 쿠폰 사용", value: g?.banner_to_coupon ?? null, prev: prevIf(p?.banner_to_coupon ?? null, banSample), unit: "%", source: "ga4",
          ...(banSample !== undefined ? { sample: banSample } : {}),
          note: g ? `${md(bare(g.banner.from))}~${md(bare(g.banner.to))} 배너를 누른 기기 ${g.banner.clicked}대 중 7일 안에 쿠폰을 쓴 ${g.banner.redeemed}대` : "배너 클릭 기기의 7일 내 coupon_redeemed",
          ...(g ? {} : { status: "pending" as const }),
        },
        { key: "banner_ctr", label: "배너 노출 → 클릭", value: null, unit: "%", source: "ga4", status: "app_fix", note: "home_banner_impression 이 상수만 있고 호출하는 곳이 없습니다(0건). 노출 이벤트 배포가 먼저" },
        dbMetric("push_sent", "푸시 발송", n("push_sent_this_month"), "전체 알림 + 매장 예약 알림. 개발자 테스트 발송은 뺍니다"),
      ] as Metric[],
    },
  ];

  // 퍼널 — 주간(세션)과 월 누계(쿠폰)를 같은 줄에 세우지 않는다. 뒤 두 단계는 끊긴 채로 그린다.
  const funnel = [
    { label: "앱 열기", value: g?.sessions ?? null, unit: "세션" },
    { label: "매장 상세", value: g && g.open_to_store !== null ? Math.round((g.sessions * g.open_to_store) / 100) : null, unit: "세션" },
    { label: "쿠폰 발급", value: null, unit: "건", note: "매장을 보고 받은 쿠폰만 세는 정의가 없습니다 — 앱 이벤트는 자동 지급 쿠폰까지 셉니다" },
    { label: "쿠폰 사용", value: null, unit: "건", note: "DB 칸은 이번 달 누계뿐이라 주간 세션과 같은 줄에 세울 수 없습니다. 월간 보고서에서 이어집니다" },
  ];

  const caveats = [
    "**DB·푸시 칸은 이번 달 누계입니다.** 백엔드 app-stats 에 기간 파라미터가 없어 주간으로 쪼갤 수 없습니다. 「이번 달 누계」 배지가 붙은 칸은 전주 대비 계산에서 뺐습니다.",
    "**기기 단위입니다.** 출시된 앱이 setUserId 를 안 불러 사람이 아니라 기기를 셉니다. 재설치하면 새 기기로 셉니다.",
    "**푸시 → 앱 열기는 안드로이드만 분모입니다.** iOS 는 백그라운드 수신을 못 세서 열기 건수가 어디에도 들어가지 못합니다.",
    "**빈 칸은 0 이 아닙니다.** 연결 전 · 앱 수정 대기 · 정의 보류 중 어느 쪽인지 칸마다 적었습니다.",
  ];
  if (banSample !== undefined && banSample < SMALL_SAMPLE) caveats.push(`**배너 클릭 → 쿠폰 사용은 ${banSample}대 표본입니다.** 전주 대비를 붙이지 않았습니다.`);
  if (retSample !== undefined && retSample < SMALL_SAMPLE) caveats.push(`**가입 1주 후 복귀는 ${retSample}대 코호트입니다.** 판정 근거로 쓰기엔 모자랍니다.`);
  if (newDev !== null && g?.wau) caveats.push(`**이번 주 활성 ${g.wau.toLocaleString()}대 중 ${newDev.toLocaleString()}대가 이번 주 첫 실행입니다.** 전주 대비를 "같은 사람들이 더 왔다"로 읽으면 안 됩니다.`);

  return {
    report: {
      type: "weekly",
      label: weekLabel(end),
      range: { start: dash(start), end: dash(end) },
      compare_label: "지난주",
      generated_at: today ?? new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10),
      data_asof: g ? `${g.through} 까지` : "GA4 미연결",
      author: "Probe",
      note:
        `GA4·Firebase 칸은 ${md(start)}~${md(end)} **그 주만** 센 값이라 전주(${md(shiftDay(prevEnd, -6))}~${md(prevEnd)})와 비교할 수 있습니다.\n` +
        "DB·푸시 칸은 백엔드 app-stats 에 기간 파라미터가 없어 **이번 달 누계**뿐입니다 — 「이번 달 누계」 배지를 달고 전주 대비 계산에서 뺐습니다. 주간 수치로 읽으면 안 됩니다.",
    },
    sources: [
      { key: "backend", label: "백엔드 DB", status: s ? "connected" : "pending", hint: "가입·쿠폰·스탬프·마일리지 — app-stats 집계. 기간 파라미터가 없어 이번 달 누계만 나옵니다" },
      { key: "push", label: "푸시 발송 기록", status: n("push_sent_this_month") !== null ? "connected" : "pending", hint: "발송 건수도 같은 app-stats 의 이번 달 누계입니다. 열기 비율은 Firebase 칸" },
      { key: "ga4", label: "GA4", status: g ? "connected" : "pending", hint: g ? `BigQuery 확정 테이블 ${g.through} 까지. 배너 노출 1칸만 앱 이벤트가 없어 비어 있습니다` : "BigQuery 를 읽지 못했습니다" },
      { key: "firebase", label: "Firebase", status: g ? "connected" : "pending", hint: "자동 이벤트 — 푸시 수신·열기, first_open 코호트" },
    ],
    headline: ["wau", "open_to_store", "retention_w1", "dau_wau"],
    groups,
    funnel,
    caveats,
  };
}

/** 파일 이름 — 미리보기 띠의 PNG·HTML 저장에 쓴다 */
export function appReportFilename(end: string): string {
  return `앱지표_주간보고서_${weekLabel(end).replace(/\s/g, "")}_${shiftDay(end, -6)}-${end}`.replace(/[\\/:*?"<>|\s]+/g, "_");
}

/** `<script type="application/json">` 안에 넣어도 블록이 안 끊기게 — reportTemplate.ts 와 같은 규칙 */
const safeJson = (d: unknown) =>
  JSON.stringify(d, null, 2).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const BLOCK = /(<script type="application\/json" id="report-data">)[\s\S]*?(<\/script>)/;

/** 양식에 데이터를 끼운 HTML 한 장. 양식의 HTML·CSS·JS 는 건드리지 않는다. */
export function fillAppReportTemplate(data: Json): string {
  if (!BLOCK.test(APP_REPORT_TEMPLATE_HTML)) throw new Error("앱 지표 양식에서 report-data 블록을 찾지 못했습니다 — 양식이 바뀌었는지 확인하세요");
  return APP_REPORT_TEMPLATE_HTML.replace(BLOCK, (_m, open: string, close: string) => `${open}\n${safeJson(data)}\n${close}`);
}

// ── 쿠폰 발급 → 사용 (GA4) ──────────────────────────────────────────
/**
 * 백엔드 「발급 → 사용」 한 칸을 대신할 네 칸. **GA4 기반이라 주간에서도 기간이 정확하다**
 * (DB 칸처럼 월 누계로 새지 않는다).
 *
 * 왜 네 칸인가: 2026-09 실측으로 전체 사용률 3.2% 는 사실상 학생회 추천코드 489장 중 1장(0.2%) 얘기였다.
 * 분모의 63%가 한 경로라 그 숫자로는 아무 판정도 못 한다. 캠페인 지급분과 그 외를 갈라 놓으면
 * "쿠폰이 안 쓰인다"와 "그 캠페인이 안 먹혔다"를 가를 수 있다.
 *
 * 그리고 진짜 병목은 발급이 아니라 **쿠폰함 → 사용 화면**(9월 36%)이었다. 지금까지 그 칸이 없었다.
 *
 * 이벤트가 나중에 생긴 칸은 창이 그보다 앞서면 **값을 내지 않는다**(coverage). 8월 「쿠폰함 → 사용 화면」은
 * 4.3% 로 계산되지만 그건 이벤트가 8/31 에 생겨서지 정말 낮았던 게 아니다 — 9월 36% 와 나란히 두면 거짓말이 된다.
 */
export function couponMetrics(f: CouponFunnel | null, p: CouponFunnel | null): Metric[] {
  const pv = (v: number | null | undefined, sample?: number) =>
    v === null || v === undefined || (sample !== undefined && sample < SMALL_SAMPLE) ? undefined : v;

  const org = f?.organic, camp = f?.campaign, w = f?.wallet, at = f?.attempt;
  const cov = f?.coverage;
  const top = f ? dominantSource(f) : null;

  // "full" 일 때만 값을 낸다. partial(기간 중간에 이벤트가 배포됨)도 비운다 —
  // 8월 「쿠폰함 → 사용 화면」은 4.3% 로 계산되지만 이벤트가 8/31 하루만 있던 값이라
  // 9월 36% 옆에 놓으면 "8배 좋아졌다"가 된다. 부분만 덮인 비율은 온전한 기간과 비교할 수 없다.
  const walletLive = cov?.wallet_to_use === "full";
  const outcomeLive = cov?.redeem_outcome === "full";
  const why = (c?: "full" | "partial" | "none", ev = "") =>
    c === "partial"
      ? `${ev} 이벤트가 이 기간 중간에 앱에 배포됐습니다 — 기간의 일부만 세게 되어 비웁니다. 0 이 아닙니다`
      : `${ev} 이벤트가 이 기간에는 앱에 없었습니다 — 0 이 아니라 못 센 것입니다`;

  return [
    {
      key: "coupon_rate_organic", label: "쿠폰 사용률 (캠페인 외)",
      value: org?.rate ?? null, prev: pv(p?.organic.rate, org?.issued), unit: "%", source: "ga4",
      ...(org ? { sample: org.issued } : {}),
      note: org
        ? `가입 환영·스탬프 보상·추천·한정 등 ${org.issued.toLocaleString()}장 중 ${org.redeemed.toLocaleString()}장. 기획전으로 뿌린 쿠폰은 뺐습니다`
        : "GA4 를 읽지 못했습니다",
      ...(f ? {} : { status: "pending" as const }),
    },
    {
      key: "coupon_rate_campaign", label: "쿠폰 사용률 (캠페인)",
      value: camp?.rate ?? null, prev: pv(p?.campaign.rate, camp?.issued), unit: "%", source: "ga4",
      ...(camp ? { sample: camp.issued } : {}),
      note: camp
        ? `기획전으로 뿌린 ${camp.issued.toLocaleString()}장 중 ${camp.redeemed.toLocaleString()}장`
          + (f && sourceRateNote(f, 4, "campaign") ? ` · 경로별: ${sourceRateNote(f, 4, "campaign")}` : "")
        : "GA4 를 읽지 못했습니다",
      ...(f ? {} : { status: "pending" as const }),
    },
    {
      key: "wallet_to_use", label: "쿠폰함 → 사용 화면",
      value: walletLive ? w?.rate ?? null : null,
      prev: walletLive ? pv(p?.coverage.wallet_to_use === "full" ? p.wallet.rate : null, w?.saw) : undefined,
      unit: "%", source: "ga4",
      ...(walletLive && w ? { sample: w.saw } : {}),
      note: !walletLive
        ? why(cov?.wallet_to_use, "coupon_use_screen_view")
        : w
          ? `쿠폰함을 본 기기 ${w.saw.toLocaleString()}대 중 사용 화면까지 간 ${w.opened_use.toLocaleString()}대`
          : "GA4 를 읽지 못했습니다",
      ...(walletLive && f ? {} : { status: "app_fix" as const }),
    },
    {
      key: "redeem_success", label: "사용 시도 성공률",
      value: outcomeLive ? at?.rate ?? null : null,
      prev: outcomeLive ? pv(p?.coverage.redeem_outcome === "full" ? p.attempt.rate : null, (at?.ok ?? 0) + (at?.failed ?? 0)) : undefined,
      unit: "%", source: "ga4",
      ...(outcomeLive && at ? { sample: at.ok + at.failed } : {}),
      note: !outcomeLive
        ? why(cov?.redeem_outcome, "coupon_redeem_failed")
        : at
          ? `성공 ${at.ok} · 실패 ${at.failed}`
            + (at.reasons.length ? ` (${at.reasons.map((r) => `${r.reason} ${r.n}`).join(" · ")})` : "")
            + (f?.pinFailStores.length ? ` · PIN 불일치가 몰린 매장 ${f.pinFailStores.slice(0, 3).map((s) => `#${s.restaurant_id}(${s.n})`).join(" ")}` : "")
          : "GA4 를 읽지 못했습니다",
      ...(outcomeLive && f ? {} : { status: "app_fix" as const }),
    },
  ];
}

/** 한 경로가 발급의 절반을 넘으면 백엔드 「발급 → 사용」은 사실상 그 경로 얘기다 — 판정을 유보시킨다. */
export function dominantNote(f: CouponFunnel | null): { verdict?: "flat"; extra: string } {
  const top = f ? dominantSource(f) : null;
  if (!top) return { extra: "" };
  const total = f!.bySource.reduce((a, r) => a + r.issued, 0);
  return {
    verdict: "flat",
    extra: ` · 발급의 ${Math.round((top.issued / total) * 100)}%가 「${top.source}」 한 경로(${top.issued}장 중 ${top.redeemed}장)라 이 숫자는 사실상 그 경로 얘기입니다 — 판정은 위 「캠페인 외」 칸으로 하십시오`,
  };
}
