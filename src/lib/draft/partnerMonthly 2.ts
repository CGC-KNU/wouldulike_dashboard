import type { PartnerExposure } from "@/lib/bigquery/partnerExposure";
import type { Bucket } from "@/app/api/probe/insights/summary/route";

/**
 * Probe · **제휴 가게 사장님께 공통으로 드리는 월간 보고서** — 모양 만들기.
 *
 * 가져오기는 `partnerReport.ts`, 양식 끼우기는 `fillPartnerTemplate`. 여기는 순수 변환이라
 * 테스트에서 그대로 부른다(`next/headers` 를 안 물고 있다).
 *
 * ── 누가 읽는가 ──
 * 제휴 가게 사장님 **전부**. 가게별 숫자는 없다 — 그건 매장 리포트(`/r/<토큰>`)가 맡는다.
 * 그래서 "사장님 가게가 N번 열렸습니다" 라고 쓰지 않는다. 공통 보고서에 특정 가게 숫자가
 * 섞이면 받는 사람마다 다른 말이 된다.
 *
 * ── 무엇을 쓰고 무엇을 안 쓰는가 (0925 · 0928 결정) ──
 *  · 다른 가게와 **비교하지 않는다.** 순위·평균·중앙값은 Probe 내부 화면에만 둔다.
 *  · **약점을 말하지 않는다.** 가게가 얼마나 알려졌는지를 좋은 숫자로 골라 해석한다.
 *  · **없는 숫자를 만들지 않는다.** 못 읽은 칸은 비우고 왜 비었는지 적는다 — 0 으로 채우지 않는다.
 *  · 연령 비중·슬라이드 좋아요 비중은 **넣지 않는다.** API 로 못 받고 수기 입력도 0928 에 지웠다.
 *  · 프로필 방문·팔로우도 **넣지 않는다.** 우주라이크 계정 숫자라 가게 성과가 아니다.
 *
 * ── 앱과 인스타를 엮지 않는다 ──
 * 두 숫자를 더하거나 비율로 만들지 않는다. 인스타에서 본 사람과 앱을 켠 사람이 겹치는지조차
 * 모른다(계정을 잇지 않는다). 「밖에서 알린 것」과 「앱 안에서 일어난 일」로 **나란히** 둔다.
 */

export type Num = number | null;
export type Json = Record<string, unknown>;

/** 달마다 일수가 다르다(8월 31일·9월 30일). 합계끼리 견주면 짧은 달이 손해라 하루 평균으로 본다. */
const perDay = (total: Num, days: number): Num =>
  total === null || days <= 0 ? null : Math.round((total / days) * 10) / 10;

/** 늘었으면 +N%, 줄었으면 −N%. 전달이 0 이거나 없으면 붙이지 않는다(0 으로 나눌 수 없다). */
export function growth(cur: Num, prev: Num): number | null {
  if (cur === null || prev === null || prev <= 0) return null;
  return Math.round((cur / prev - 1) * 1000) / 10;
}

export interface PartnerCard {
  key: string;
  label: string;
  value: Num;
  unit: string;
  /** 전달 대비 % — 없으면 칩을 숨긴다 */
  change?: number | null;
  note: string;
  /** 값이 없을 때 왜 없는지. 0 이 아니라는 뜻이다 */
  status?: "pending";
}

export interface PartnerMonthlyInput {
  /** "YYYY-MM" */
  period: string;
  app: PartnerExposure | null;
  appPrev: PartnerExposure | null;
  instagram: Bucket | null;
  instagramPrev: Bucket | null;
  /** 작성일 (KST, YYYY-MM-DD) */
  today: string;
  /** GA4 확정 테이블이 달 끝보다 이르면 그 날짜 — 각주에 밝힌다 */
  through?: string | null;
}

const kLabel = (period: string) => `${+period.slice(0, 4)}년 ${+period.slice(5, 7)}월`;

export function buildPartnerMonthlyData(i: PartnerMonthlyInput): Json {
  const { period, app, appPrev, instagram: ig, instagramPrev: igPrev } = i;
  const days = app?.window.days ?? 0;
  const prevDays = appPrev?.window.days ?? 0;

  const card = (
    key: string, label: string, value: Num, prev: Num, unit: string, note: string
  ): PartnerCard => ({
    key, label, value, unit,
    ...(value === null ? { status: "pending" as const } : {}),
    change: growth(value, prev),
    note,
  });

  /** 밖에서 얼마나 알렸나 — 인스타 + 앱에서 가게 화면이 열린 횟수 */
  const reach: PartnerCard[] = [
    card("ig_reach", "게시물을 본 사람", ig?.reach ?? null, igPrev?.reach ?? null, "명",
      "우주라이크 인스타그램에서 가게가 소개된 게시물을 한 번이라도 본 계정 수입니다. 같은 사람은 한 번만 셉니다"),
    card("ig_views", "게시물 조회", ig?.views ?? null, igPrev?.views ?? null, "회",
      "게시물이 화면에 펼쳐진 횟수입니다. 같은 사람이 여러 번 보면 그때마다 셉니다"),
    card("store_opens_per_day", "가게 소개 화면 열람", perDay(app?.store_opens ?? null, days), perDay(appPrev?.store_opens ?? null, prevDays), "회/일",
      "앱에서 학생이 가게 소개 화면을 연 하루 평균 횟수입니다. 메뉴·위치·쿠폰을 확인하려고 여는 곳입니다"),
  ];

  /** 학생들이 실제로 한 일 — 저장·공유는 인스타, 쿠폰·스탬프는 앱 */
  const action: PartnerCard[] = [
    card("ig_saved", "저장", ig?.saved ?? null, igPrev?.saved ?? null, "회",
      "「나중에 가봐야지」 하고 담아 둔 수입니다 — 방문 의향에 가장 가까운 신호로 봅니다"),
    card("ig_shares", "공유", ig?.shares ?? null, igPrev?.shares ?? null, "회",
      "「여기 같이 가자」고 친구에게 보낸 수입니다"),
    card("coupons_used", "가게에서 쓰인 쿠폰", app?.coupons_used ?? null, appPrev?.coupons_used ?? null, "장",
      "학생이 가게에 와서 앱 화면을 보여주고 처리된 쿠폰입니다"),
    card("stamps", "스탬프 적립", app?.stamps ?? null, appPrev?.stamps ?? null, "회",
      "가게를 다시 찾은 학생이 모은 도장입니다"),
  ];

  return {
    report: {
      type: "partner_monthly",
      label: kLabel(period),
      period,
      range: app ? { start: app.window.from, end: app.window.to } : null,
      generated_at: i.today,
      /** 확정 테이블이 달 끝보다 이르면 며칠이 빠졌는지 화면이 말한다 */
      through: i.through ?? null,
    },
    /** 머리말에 크게 띄울 것 — 값이 있는 것만 양식이 고른다 */
    headline: ["ig_reach", "store_opens_per_day", "coupons_used"],
    groups: [
      { key: "reach", title: "가게가 얼마나 알려졌나", description: "인스타그램에서 소개되고, 앱에서 찾아본 기록입니다.", cards: reach },
      { key: "action", title: "학생들이 실제로 한 일", description: "보기만 한 것이 아니라 담아 두고, 나누고, 가게로 온 기록입니다.", cards: action },
    ],
    app: app
      ? {
          active_devices: app.active_devices,
          store_viewers: app.store_viewers,
          stores_seen: app.stores_seen,
          coupon_users: app.coupon_users,
          coupons_issued_organic: app.coupons_issued_organic,
        }
      : null,
    instagram: ig ? { posts: ig.posts, pending_d7: ig.pending_d7 } : null,
  };
}
