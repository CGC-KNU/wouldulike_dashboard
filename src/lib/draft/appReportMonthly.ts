import type { Ga4AppMetrics } from "@/lib/bigquery/appMetrics";
import { SMALL_SAMPLE, bannerCtrMetric, couponMetrics, couponUseFunnelData, detailSessions, dominantNote, returningBase, type Json, type Metric } from "./appReportData";
import { FOLLOW_DAYS, type CouponFunnel, type CouponUseFunnel, type StoreToCoupon } from "@/lib/bigquery/couponFunnel";

/**
 * Probe · 앱 지표 **월간 보고서**의 데이터 변환 — 순수 함수만(가져오기는 appReport.ts).
 *
 * 주간과 갈리는 곳은 셋이다.
 *
 * ① **DB 칸에 전월 대비가 붙는다.** 주간은 app-stats 가 이번 달 누계만 줘서 `month_to_date` 배지를 달고
 *    증감을 못 그렸다. 월간은 백엔드 월별 스냅샷(`/api/dashboard/admin/metric-snapshots/`)에서 그 달과
 *    전월을 통째로 받아오므로 `scope: "period"` 로 넣고 증감칩을 그린다. **이게 월간 보고서의 이유다.**
 *
 * ② **창이 한 달이라 DAU/WAU 가 아니라 DAU/MAU 다.** 분모가 7일에서 한 달로 커지면 값이 3~4배 낮게 나온다
 *    (실측: 주간 20.5% ↔ 8월 5.5%). 이름을 「월간 활성(MAU)」·「DAU/MAU」로 바꾸고, 양식 각주도 type 으로 갈린다.
 *    주간 값과 나란히 놓고 읽으면 안 된다.
 *
 * ③ **스냅샷이 없는 달은 만들어 낼 수 없다.** 그 달 행이 없으면 DB 칸은 `status: "pending"`,
 *    전월 행이 없으면 증감만 뺀다 — 어느 쪽도 0 으로 채우지 않는다.
 */

type Num = number | null;

/** 백엔드 `/api/dashboard/admin/metric-snapshots/` 응답 */
export interface SnapshotSide {
  period: string;
  complete: boolean;
  counted_at: string;
  failed: string[];
  stats: Record<string, number | null>;
}
export interface SnapshotPayload {
  period: string;
  current: SnapshotSide | null;
  previous: SnapshotSide | null;
  available?: string[];
}

export interface MonthlyReportInput {
  /** "YYYY-MM" */
  period: string;
  cur: Ga4AppMetrics | null;
  prev: Ga4AppMetrics | null;
  snapshot: SnapshotPayload | null;
  /** 작성일(KST, YYYY-MM-DD). 안 주면 오늘. */
  today?: string;
  /** 매장 상세 → 쿠폰 발급 (GA4). 주간 보고서·Probe 화면과 같은 함수를 쓴다. */
  storeToCoupon?: StoreToCoupon | null;
  /** 쿠폰 발급→사용 (GA4). 스냅샷의 DB 칸과 달리 기간이 정확하다. */
  coupons?: CouponFunnel | null;
  couponsPrev?: CouponFunnel | null;
  /** 쓰기 퍼널 (GA4, 쿠폰 한 장 단위) — 그 달 발급분을 한 장씩 발급 뒤 7일까지 따라간다. 없으면 「연결 전」. */
  couponUse?: CouponUseFunnel | null;
}

const MONTH_LABEL = (p: string) => `${+p.slice(0, 4)}년 ${+p.slice(5, 7)}월`;
/** "2026-01" → "2025-12" */
export function previousPeriod(p: string): string {
  const y = +p.slice(0, 4);
  const m = +p.slice(5, 7);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
const bare = (s: string) => s.replace(/-/g, "");
const md = (s: string) => `${+s.slice(4, 6)}/${+s.slice(6, 8)}`;

function prevIf(prev: Num, sample?: number): Num | undefined {
  if (prev === null || prev === undefined) return undefined;
  if (sample !== undefined && sample < SMALL_SAMPLE) return undefined;
  return prev;
}

/** 분모가 반 이상 달라진 달의 비율은 판정을 유보한다 — 주간과 같은 규칙 */
function verdictForRatio(curBase: Num, prevBase: Num): "flat" | undefined {
  if (!curBase || !prevBase) return undefined;
  return Math.abs(curBase - prevBase) / prevBase >= 0.5 ? "flat" : undefined;
}

const UNIT: Record<string, string> = {
  signups: "명", coupon_issued: "건", coupon_redeemed: "건", coupon_redeem_rate: "%",
  stamp_earned: "건", stamp_reward: "건", mileage_entries: "건", mileage_winners: "건",
  mileage_exchanges: "건", push_sent: "건",
};

export function buildMonthlyAppReportData({ period, cur: g, prev: p, snapshot, today, coupons, couponsPrev, storeToCoupon: s2c, couponUse }: MonthlyReportInput): Json {
  const snap = snapshot?.current ?? null;
  const snapPrev = snapshot?.previous ?? null;
  const s = snap?.stats ?? null;
  const n = (k: string) => (s && typeof s[k] === "number" ? (s[k] as number) : null);
  const np = (k: string) => {
    const v = snapPrev?.stats?.[k];
    return typeof v === "number" ? v : null;
  };

  const prevLabel = snapPrev ? MONTH_LABEL(snapPrev.period) : "지난달";

  /**
   * DB 칸 — 스냅샷이 준 **그 달만의** 값이다. 주간의 month_to_date 와 다르다.
   * 전월 행이 없으면 prev 를 빼서 증감칩이 안 그려지게 한다(0 으로 두면 「전월 없음」이 아니라 「0에서 늘었다」가 된다).
   */
  const dbMetric = (key: string, label: string, note?: string): Metric => {
    const value = n(key);
    const failedHere = (snap?.failed ?? []).includes(key);
    return {
      key, label, value, unit: UNIT[key], source: key === "push_sent" ? "push" : "backend",
      scope: "period",
      // 한 경로가 발급의 절반을 넘으면 「발급 → 사용」은 그 경로 얘기라 색을 중립으로 둔다 (주간과 같은 규칙)
      ...(key === "coupon_redeem_rate" && dom.verdict ? { verdict: dom.verdict } : {}),
      ...(value !== null ? { prev: np(key) ?? undefined } : {}),
      ...(value === null ? { status: "pending" as const } : {}),
      ...(note || failedHere || !snap
        ? { note: !snap
              ? `${MONTH_LABEL(period)} 스냅샷이 없습니다 — 그 달은 만들어 낼 수 없습니다`
              : failedHere ? "스냅샷을 만들 때 이 칸을 세지 못했습니다" : note }
        : {}),
    };
  };

  const newDev = g?.new_devices ?? null;

  const ret = returningBase(g ?? null, p ?? null);

  // 첫 실행 비중이 크게 달라진 달끼리는 MAU 를 그대로 견줄 수 없다 — 갈라서 같이 적는다.

  const retLine = ret && ret.mixShifted && ret.delta !== null

    ? ` 전달은 ${p!.wau!.toLocaleString()}대 중 ${p!.new_devices!.toLocaleString()}대가 첫 실행이라 같은 조건이 아닙니다 — 두 달 모두 **처음 온 기기를 빼면 ${ret.prev.toLocaleString()} → ${ret.cur.toLocaleString()}대(${ret.delta > 0 ? "+" : ""}${ret.delta}%)** 입니다`

    : "";
  const retSample = g?.cohort.users;
  const pushSample = g?.push.received;
  const banSample = g?.banner.clicked;
  const ratioVerdict = verdictForRatio(g?.wau ?? null, p?.wau ?? null);
  const dom = dominantNote(coupons ?? null);
  const win = g ? `${md(bare(g.week.from))}~${md(bare(g.week.to))}` : MONTH_LABEL(period);
  // 확정 테이블이 달 끝까지 없으면 GA4 칸은 그 달 전체가 아니다. 숫자를 내되 반드시 알린다.
  const lastDayOfMonth = `${period}-${String(new Date(Date.UTC(+period.slice(0,4), +period.slice(5,7), 0)).getUTCDate()).padStart(2, "0")}`;
  const ga4Short = g ? g.week.to < lastDayOfMonth : false;

  const groups = [
    {
      key: "usage", title: "앱 이용", description: "얼마나 많은 학생이 앱을 켜고, 돌아오는가.",
      metrics: [
        {
          key: "wau", label: "월간 활성(MAU)", value: g?.wau ?? null, prev: prevIf(p?.wau ?? null), unit: "명", source: "ga4",
          // 주간과 같은 규칙 — 첫 실행 비중이 크게 달라진 달끼리는 그대로 견줄 수 없다
          ...(ret?.mixShifted ? { verdict: "flat" as const } : {}),
          note: g
            ? (newDev !== null && g.wau
                ? `${win} 앱을 켠 기기 ${g.wau.toLocaleString()}대 중 ${newDev.toLocaleString()}대가 그 달에 처음 연 기기입니다. 재설치하면 새로 셉니다.${retLine}`
                : `${win} 앱을 켠 기기 수. 재설치하면 새로 셉니다`)
            : "그 달 고유 사용자 — BigQuery 를 읽지 못했습니다",
          ...(g ? {} : { status: "pending" as const }),
        },
        {
          key: "dau", label: "일간 활성(DAU)", value: g?.dau ?? null, prev: prevIf(p?.dau ?? null), unit: "명", source: "ga4",
          ...(ret?.mixShifted ? { verdict: "flat" as const } : {}),
          note: g ? `${win} 하루 평균 앱을 켠 기기 수(사용자가 없던 날도 하루로 셉니다). 9/20 개발 회의 목표는 평균 150명` : "하루 평균 접속 기기 — BigQuery 를 읽지 못했습니다",
          ...(g && g.dau != null ? {} : { status: "pending" as const }),
        },
        {
          key: "dau_wau", label: "DAU/MAU", value: g?.dau_wau ?? null, prev: prevIf(p?.dau_wau ?? null), unit: "%", source: "ga4",
          ...(ratioVerdict ? { verdict: ratioVerdict } : {}),
          note: "하루 평균 접속 기기 ÷ 월간 활성. 분모가 한 달이라 주간(DAU/WAU)보다 훨씬 낮게 나옵니다 — 두 값을 나란히 비교하지 않습니다"
            + (ratioVerdict ? ` · 분모(MAU)가 ${p?.wau?.toLocaleString()} → ${g?.wau?.toLocaleString()} 으로 크게 달라져 전월과 같은 조건이 아닙니다` : ""),
          ...(g ? {} : { status: "pending" as const }),
        },
        {
          key: "retention_w1", label: "가입 1주 후 복귀", value: g?.retention_w1 ?? null,
          prev: prevIf(p?.retention_w1 ?? null, retSample), unit: "%", source: "firebase",
          ...(retSample !== undefined ? { sample: retSample } : {}),
          note: g
            ? `${md(bare(g.cohort.from))}~${md(bare(g.cohort.to))} 첫 실행 ${g.cohort.users.toLocaleString()}대 중 7~13일째 다시 켠 비율. 복귀 관찰이 그 달 안에 다 들어오도록 코호트를 달 끝 13일 전까지만 잡았습니다`
            : "first_open 코호트의 7일 뒤 재방문",
          ...(g ? {} : { status: "pending" as const }),
        },
        dbMetric("signups", "가입", "그 달에 새로 만든 계정"),
      ] as Metric[],
    },
    {
      key: "funnel", title: "전환 퍼널", description: "앱을 켠 사람이 실제로 매장에서 쓰기까지.",
      metrics: [
        {
          key: "open_to_store", label: "앱 열기 → 매장 상세", value: g?.open_to_store ?? null,
          prev: prevIf(p?.open_to_store ?? null), unit: "%", source: "ga4",
          note: g ? `${win} 세션 ${g.sessions.toLocaleString()}개 중 매장 상세를 연 비율` : "같은 세션 안 매장 상세 이벤트 유무",
          ...(g ? {} : { status: "pending" as const }),
        },
        {
          key: "store_to_coupon", label: "매장 상세 → 쿠폰 발급", value: s2c?.rate ?? null, unit: "%", source: "ga4",
          ...(s2c ? { sample: s2c.views } : { status: "pending" as const }),
          // 「정의 보류」였던 칸이다. 캠페인 자동 지급을 분자에서 뺀다 — 주간 보고서와 같은 함수·같은 기준.
          note: s2c
            ? `매장 상세를 연 ${s2c.views.toLocaleString()}자리(기기·세션·매장) 중 그 자리에서 쿠폰을 받은 ${s2c.claimed.toLocaleString()}자리. 캠페인 자동 지급까지 세면 ${s2c.claimed_including_campaign.toLocaleString()}자리입니다`
            : "매장 상세를 연 자리에서 캠페인이 아닌 쿠폰을 받은 비율",
        },
        dbMetric("coupon_issued", "쿠폰 발급"),
        dbMetric("coupon_redeemed", "쿠폰 사용"),
        dbMetric("coupon_redeem_rate", "발급 → 사용", `그 달 발급분 중 쓴 비율. 달이 끝난 뒤 센 값이라 달 중간에 보던 수치보다 높습니다${dom.extra}`),
        ...couponMetrics(coupons ?? null, couponsPrev ?? null),
        // 「7일 안에 만료」는 월간에 없다 — 누계가 아니라 읽는 시점 기준 앞으로 7일이라 지난 달에 대고 물을 수 없다.
      ] as Metric[],
    },
    {
      key: "loyalty", title: "스탬프 · 마일리지", description: "재방문 장치가 실제로 도는가.",
      metrics: [
        dbMetric("stamp_earned", "스탬프 적립"),
        dbMetric("stamp_reward", "스탬프 보상 수령", "스탬프를 채워 발급된 보상 쿠폰"),
        dbMetric("mileage_entries", "마일리지 응모"),
        dbMetric("mileage_winners", "마일리지 당첨"),
        dbMetric("mileage_exchanges", "마일리지로 쿠폰 교환", "월 발급 한도(재무 캡) 대비"),
      ] as Metric[],
    },
    {
      key: "push", title: "푸시 · 배너", description: "보낸 알림이 사람을 앱으로 데려오는가.",
      metrics: [
        dbMetric("push_sent", "푸시 발송", "전체 알림 + 매장 예약 알림. 개발자 테스트 발송은 뺍니다"),
        {
          key: "push_open", label: "푸시 → 앱 열기", value: g?.push_open ?? null,
          prev: prevIf(p?.push_open ?? null, pushSample), unit: "%", source: "firebase",
          ...(pushSample !== undefined ? { sample: pushSample } : {}),
          note: g ? `${md(bare(g.push.from))}~${md(bare(g.push.to))} 안드로이드 수신 ${g.push.received.toLocaleString()}건 중 ${g.push.opened_android}건 열림 (iOS 는 수신을 못 세 열기 ${g.push.opened_ios}건만)` : "Firebase 자동 이벤트(notification_receive/open)",
          ...(g ? {} : { status: "pending" as const }),
        },
        {
          key: "banner_to_coupon", label: "배너 클릭 → 쿠폰 사용", value: g?.banner_to_coupon ?? null,
          prev: prevIf(p?.banner_to_coupon ?? null, banSample), unit: "%", source: "ga4",
          ...(banSample !== undefined ? { sample: banSample } : {}),
          note: g ? `${md(bare(g.banner.from))}~${md(bare(g.banner.to))} 배너를 누른 기기 ${g.banner.clicked}대 중 7일 안에 쿠폰을 쓴 ${g.banner.redeemed}대` : "배너 클릭 기기의 7일 내 coupon_redeemed",
          ...(g ? {} : { status: "pending" as const }),
        },
        bannerCtrMetric(g, p),
      ] as Metric[],
    },
  ];

  // 찾기 퍼널 — 세 단계를 모두 세션 단위로 센다(주간과 같은 정의). 예전에는 뒤 두 단계를
  // 스냅샷 DB 에서 가져올 수밖에 없어 단위가 달라 끊어 뒀다.
  // 발급은 캠페인 자동 지급을 뺀 수다. 4단 「쿠폰 사용」은 세션으로 이을 수 없어 쓰기 퍼널로 옮겼다(민찬 1010).
  const funnel = [
    { label: "앱 열기", value: g?.sessions ?? null, unit: "세션" },
    { label: "매장 상세", value: detailSessions(g), unit: "세션" },
    { label: "쿠폰 발급", value: g?.sessions_detail_to_coupon ?? null, unit: "세션", note: "같은 세션에서 그 매장 상세를 열고 그 매장 쿠폰을 받은 세션. 캠페인 자동 지급은 뺍니다 — 받은 쿠폰이 쓰였는지는 아래 「쓰기 퍼널」이 봅니다" },
  ];
  const couponFunnel = couponUseFunnelData(
    couponUse ?? null,
    `${+period.slice(5, 7)}월 발급분`,
    `그 달에 받은 쿠폰을 한 장씩 발급 뒤 ${FOLLOW_DAYS}일까지 따라갑니다 — 말일에 받은 쿠폰은 다음 달 초까지 봅니다. 위 사용률 칸은 그 달 안에 쓴 것만 세서 값이 조금 다를 수 있습니다.`
  );

  const caveats = [
    "**DAU/MAU 는 주간 보고서의 DAU/WAU 와 다른 값입니다.** 분모가 한 달이라 훨씬 낮게 나옵니다 — 두 보고서의 숫자를 나란히 놓고 비교하지 마십시오.",
    "**기기 단위입니다.** 출시된 앱이 setUserId 를 안 불러 사람이 아니라 기기를 셉니다. 재설치하면 새 기기로 셉니다.",
    "**푸시 → 앱 열기는 안드로이드만 분모입니다.** iOS 는 백그라운드 수신을 못 세서 열기 건수가 어디에도 들어가지 못합니다.",
    "**빈 칸은 0 이 아닙니다.** 연결 전 · 앱 수정 대기 · 정의 보류 중 어느 쪽인지 칸마다 적었습니다.",
  ];
  if (ga4Short) {
    caveats.unshift(`**GA4 칸은 ${g!.week.to} 까지만 센 값입니다.** ${MONTH_LABEL(period)} 이 아직 끝나지 않았거나 확정 테이블이 덜 왔습니다 — 달 전체 수치가 아닙니다.`);
  }
  if (!snap) {
    caveats.unshift(`**${MONTH_LABEL(period)} 스냅샷이 없어 DB 칸이 비었습니다.** 스냅샷을 걸기 전 달은 되살릴 수 없습니다 — \`snapshot_metrics --period ${period}\` 로 만들 수 있는지 먼저 확인하십시오.`);
  } else if (!snapPrev) {
    caveats.unshift(`**전월(${MONTH_LABEL(previousPeriod(period))}) 스냅샷이 없어 DB 칸의 전월 대비가 없습니다.** 0 이 아니라 비교할 값이 없는 것입니다.`);
  } else if (snap && !snap.complete) {
    caveats.unshift(`**${MONTH_LABEL(period)} 은 아직 끝나지 않았습니다.** DB 칸은 ${snap.counted_at.slice(0, 10)} 까지의 누계라 전월과 같은 조건이 아닙니다.`);
  }
  if (snap?.failed?.length) caveats.push(`**스냅샷이 못 센 칸이 있습니다** — ${snap.failed.join(" · ")}.`);
  if (banSample !== undefined && banSample < SMALL_SAMPLE) caveats.push(`**배너 클릭 → 쿠폰 사용은 ${banSample}대 표본입니다.** 전월 대비를 붙이지 않았습니다.`);
  if (retSample !== undefined && retSample < SMALL_SAMPLE) caveats.push(`**가입 1주 후 복귀는 ${retSample}대 코호트입니다.** 판정 근거로 쓰기엔 모자랍니다.`);
  if (newDev !== null && g?.wau) caveats.push(`**그 달 활성 ${g.wau.toLocaleString()}대 중 ${newDev.toLocaleString()}대가 그 달 첫 실행입니다.** 전월 대비를 "같은 사람들이 더 왔다"로 읽으면 안 됩니다.`);

  const y = +period.slice(0, 4);
  const m = +period.slice(5, 7);
  const lastDay = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 0)).getUTCDate();

  return {
    report: {
      type: "monthly",
      label: MONTH_LABEL(period),
      range: { start: `${period}-01`, end: `${period}-${String(lastDay).padStart(2, "0")}` },
      compare_label: prevLabel,
      generated_at: today ?? new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10),
      data_asof: g ? `GA4 ${g.through} 까지${ga4Short ? "(달 끝 전)" : ""}${snap ? ` · DB 스냅샷 ${snap.counted_at.slice(0, 10)}` : ""}` : "GA4 미연결",
      author: "Probe",
      note:
        `GA4·Firebase 칸은 ${MONTH_LABEL(period)} **그 달만** 센 값입니다. 창이 한 달이라 ==DAU/MAU== 이며, 주간 보고서의 DAU/WAU 와 같은 줄에 놓고 읽으면 안 됩니다.\n`
        + (snap
            ? `DB·푸시 칸은 백엔드 월별 스냅샷(${snap.counted_at.slice(0, 10)} 기준)에서 읽었습니다 — **그 달만의 값**이라 전월 대비가 붙습니다.`
            : "DB·푸시 칸은 월별 스냅샷이 없어 비어 있습니다 — **0 이 아닙니다.**"),
    },
    sources: [
      { key: "backend", label: "백엔드 DB", status: snap ? "connected" : "pending", hint: snap ? `월별 스냅샷 — ${snap.period} 를 ${snap.counted_at.slice(0, 10)} 에 세어 굳힌 값` : "월별 스냅샷이 없습니다. snapshot_metrics 를 돌려야 채워집니다" },
      { key: "push", label: "푸시 발송 기록", status: n("push_sent") !== null ? "connected" : "pending", hint: "발송 건수도 같은 스냅샷에서 옵니다. 열기 비율은 Firebase 칸" },
      { key: "ga4", label: "GA4", status: g ? "connected" : "pending", hint: g ? `BigQuery 확정 테이블 ${g.through} 까지.${(g.banner_view?.seen ?? 0) > 0 ? "" : " 배너 노출은 이 창에 아직 0건이라 그 칸만 비어 있습니다"}` : "BigQuery 를 읽지 못했습니다" },
      { key: "firebase", label: "Firebase", status: g ? "connected" : "pending", hint: "자동 이벤트 — 푸시 수신·열기, first_open 코호트" },
    ],
    // 스냅샷이 없으면 signups·coupon_redeem_rate 가 비어 타일 넷 중 둘이 「연결 전」이 된다 —
    // 보고서를 열자마자 보이는 줄이라 값이 있는 칸으로 채운다(양식은 headline 이 없으면 채워진 칸에서 고른다).
    ...(snap ? { headline: ["wau", "signups", "coupon_redeem_rate", "retention_w1"] } : {}),
    groups,
    funnel,
    coupon_funnel: couponFunnel,
    caveats,
  };
}
