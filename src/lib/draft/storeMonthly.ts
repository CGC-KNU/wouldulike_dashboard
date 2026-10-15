/**
 * Probe · **매장 하나의 사장님 월간 보고서** — 모양 만들기(1015).
 *
 * 가져오기는 `storeMonthlyReport.ts`, 양식 끼우기는 `storeMonthlyTemplate.ts`. 여기는 순수 변환이라
 * 테스트에서 그대로 부른다.
 *
 * ── 세 보고서의 자리 ──
 *  · `/r/partners`      모든 가게에 공통 — 가게별 숫자 없음
 *  · `/r/<토큰>`         인스타 게시물 하나
 *  · `/r/store/<rid>`   **이것** — 그 가게의 한 달 앱 기록. 인스타 칸은 넣지 않는다(민찬 1015 「앱 숫자만」).
 *
 * ── 무엇을 쓰고 무엇을 안 쓰는가 (0925 방향 그대로) ──
 *  · 숫자는 사장님 홈과 **같은 세는 법**이다(백엔드 partner/month — 스탬프 = 개수, 재방문 = 다른 날).
 *    Probe 매장 지표 표(적립 횟수·2번 이상)와 다르다. 사장님이 홈에서 보는 숫자와 어긋나면 안 된다.
 *  · **0 인 칸은 빼고 그린다.** 약점을 말하지 않는다. 못 읽은 칸도 뺀다 — 왜 빠졌는지는 담당자 띠(warnings)가 말한다.
 *  · 다른 가게와 비교하지 않는다. 지난달은 % 없이 **숫자만 나란히** — 한 자리 숫자라 2→4 가 +100% 가 된다.
 *  · 쿠폰 발급은 넣지 않는다 — 캠페인 자동 지급이 섞이고, 쿠폰함을 열 때 만료분이 지워져 지난달 값이 준다.
 *  · 사용 실패(PIN)는 넣지 않는다 — 영업이 쓰는 내부 칸이다.
 *  · 스탬프를 안 쓰는 매장은 스탬프·재방문·단골을 통째로 뺀다(그 0 은 「안 쓰는 기능」이다).
 */

import { proxyableImage } from "./imageHosts";

export type Num = number | null;
export type Json = Record<string, unknown>;

/** 백엔드 `/api/astro/partner/month/` 응답 — 필요한 칸만 */
export interface PartnerMonth {
  store: {
    restaurant_id: number; name: string; is_affiliate: boolean; hidden_from_app: boolean; stamp_enabled: boolean;
    /** 앱과 같은 순서의 가게 사진(첫 장 = 앱 목록 썸네일). backend #165 전 응답에는 없다 */
    photos?: string[];
  };
  period: string;
  complete: boolean;
  stats: { coupon_used: number; stamp: number; revisit: number };
  prev: { period: string; coupon_used: number; stamp: number; revisit: number };
  loyal_total: number;
  wishlist_total: number | null;
}

export interface StoreMonthlyInput {
  /** "YYYY-MM" */
  period: string;
  db: PartnerMonth;
  /** GA4 그 달 · 지난달 가게 화면을 연 기기. 못 읽었거나 이벤트가 없던 달이면 null */
  viewers: Num;
  viewersPrev: Num;
  /** 작성일 (KST, YYYY-MM-DD) */
  today: string;
  /** GA4 확정 테이블이 달 끝보다 이르면 그 날짜(YYYY-MM-DD) — 각주에 밝힌다 */
  through?: string | null;
}

export interface StoreCard {
  key: string;
  label: string;
  value: number;
  unit: string;
  /** 지난달 한 달 전체 — 누적 칸·못 읽은 달은 없다 */
  prev?: number | null;
  note: string;
}

const monthNo = (period: string) => +period.slice(5, 7);
const kLabel = (period: string) => `${+period.slice(0, 4)}년 ${monthNo(period)}월`;
const lastDay = (period: string) => {
  const y = +period.slice(0, 4), m = monthNo(period);
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 0)).getUTCDate();
};

/** 0·null 은 뺀다 — 0 은 약점이고 null 은 모름이다. 둘 다 사장님 종이에 그리지 않는다. */
const shown = (v: Num): v is number => v !== null && v > 0;

/**
 * 머리 한 줄 — 「9월 한 달 동안 학생 42명이 앱에서 가게 화면을 열어 봤습니다. 쿠폰 5장이 가게에서 쓰였고, 스탬프 12개가 적립됐습니다.」
 * 0 인 것은 문장에서도 뺀다. 아무것도 없으면 null(그 보고서는 나가지 않는다 — storeMissing).
 */
export function storeSummary(m: number, v: { viewers: Num; coupons: Num; stamps: Num }): string | null {
  const first = shown(v.viewers) ? `${m}월 한 달 동안 학생 ${v.viewers.toLocaleString("ko-KR")}명이 앱에서 가게 화면을 열어 봤습니다.` : null;
  const acts = [
    shown(v.coupons) ? `쿠폰 ${v.coupons.toLocaleString("ko-KR")}장이 가게에서 쓰였` : null,
    shown(v.stamps) ? `스탬프 ${v.stamps.toLocaleString("ko-KR")}개가 적립됐` : null,
  ].filter((x): x is string => x !== null);
  const second = acts.length ? `${first ? "" : `${m}월 한 달 동안 `}${acts.join("고, ")}습니다.` : null;
  return [first, second].filter(Boolean).join(" ") || null;
}

/** 첫 장에 싣는 사진 수 — 대표 한 장 + 작은 두 장 */
const MAX_PHOTOS = 3;

/**
 * 첫 장 사진. `/api/img` 가 못 읽는 주소는 뺀다 — 화면엔 보여도 PNG·HTML 저장에서 빈 칸이 된다.
 * 작은 사진은 두 장일 때만 줄을 채우므로, 대표 + 한 장이면 대표만 쓴다.
 */
export function pickPhotos(photos: string[] | undefined): string[] {
  const ok = (photos ?? []).filter(proxyableImage);
  return ok.length >= MAX_PHOTOS ? ok.slice(0, MAX_PHOTOS) : ok.slice(0, 1);
}

export function buildStoreMonthlyData(i: StoreMonthlyInput): Json {
  const { period, db } = i;
  const m = monthNo(period);
  const pm = monthNo(db.prev.period);
  const stampOn = db.store.stamp_enabled;

  const card = (key: string, label: string, value: Num, prev: Num | undefined, unit: string, note: string): StoreCard | null =>
    shown(value) ? { key, label, value, unit, ...(prev === undefined ? {} : { prev }), note } : null;

  const seen = [
    card("viewers", "가게 화면을 열어 본 학생", i.viewers, i.viewersPrev, "명",
      "우주라이크 앱에서 가게 소개 화면을 연 학생 수입니다. 메뉴·위치·쿠폰을 보려고 여는 화면이고, 같은 학생은 한 번만 셉니다."),
    card("wishlist", "가게를 찜해 둔 학생", db.wishlist_total, undefined, "명",
      `「나중에 꼭 가 봐야지」 하고 앱에 담아 둔 학생 수입니다. ${m}월 말까지 쌓인 숫자입니다.`),
  ].filter((c): c is StoreCard => c !== null);

  const visit = [
    card("coupons", "가게에서 쓰인 쿠폰", db.stats.coupon_used, db.prev.coupon_used, "장",
      "학생이 가게에 와서 앱 화면을 보여 주고 처리된 쿠폰입니다."),
    ...(stampOn
      ? [
          card("stamps", "적립된 스탬프", db.stats.stamp, db.prev.stamp, "개",
            "가게에서 찍어 드린 스탬프 개수입니다. 한 번에 여러 개를 찍으면 그만큼 셉니다."),
          card("revisit", "다시 찾아온 학생", db.stats.revisit, db.prev.revisit, "명",
            `${m}월에 서로 다른 날 두 번 이상 스탬프를 받은 학생입니다.`),
          card("loyal", "단골 학생", db.loyal_total, undefined, "명",
            `지금까지 서로 다른 날 세 번 이상 스탬프를 받은 학생입니다. ${m}월 말까지 쌓인 숫자입니다.`),
        ]
      : []),
  ].filter((c): c is StoreCard => c !== null);

  const groups = [
    { key: "seen", title: "앱에서 가게를 찾아본 학생", description: "가게에 오기 전, 앱에서 가게를 살펴본 기록입니다.", cards: seen },
    { key: "visit", title: "가게로 찾아온 학생", description: `앱 ${stampOn ? "쿠폰과 스탬프" : "쿠폰"}으로 남은, 실제로 가게에 온 기록입니다.`, cards: visit },
  ].filter((g) => g.cards.length > 0);

  return {
    report: {
      type: "store_monthly",
      label: kLabel(period),
      month: m,
      prev_month: pm,
      period,
      range: { start: `${period}-01`, end: `${period}-${String(lastDay(period)).padStart(2, "0")}` },
      generated_at: i.today,
      through: i.through ?? null,
    },
    store: { name: db.store.name, stamp_enabled: stampOn },
    /** 첫 장 사진 — 비면 양식이 사진 칸을 안 그리고, 라우트가 PNG 를 한 장으로 낸다 */
    photos: pickPhotos(db.store.photos),
    summary: storeSummary(m, { viewers: i.viewers, coupons: db.stats.coupon_used, stamps: stampOn ? db.stats.stamp : null }),
    /** 머리에 크게 띄울 것 — 그려진 칸 중에서 이 순서로 셋까지 */
    headline: ["viewers", "coupons", "stamps", "revisit", "wishlist"],
    groups,
  };
}

/**
 * PNG 장 나누기 — 양식 구획(id)으로 자른다(reportDownload `pages`).
 * 사진이 있으면 1장 = 가게 사진, 2장 = 지표(민찬 1015). 사진이 없으면 1장이 제목뿐이라 **한 장 통째로** 낸다.
 * 양식에 구획을 더하면 여기에도 넣는다 — 목록 밖 구획은 두 장 어디에도 안 나온다(테스트가 잡는다).
 */
export const STORE_PNG_COVER = ["s-head", "s-photo", "s-hello"];
export const STORE_PNG_METRICS = ["s-sum", "s-kpi", "s-groups", "s-close", "s-foot"];

export function storePngPages(data: Json): { no: number; ids: string[] }[] {
  const photos = (data.photos ?? []) as unknown[];
  return photos.length
    ? [{ no: 1, ids: STORE_PNG_COVER }, { no: 2, ids: STORE_PNG_METRICS }]
    : [{ no: 1, ids: [] }];
}

/** 이 달 일어난 일(누적이 아닌 칸) — 하나도 없으면 그 달 보고서는 빈 종이다 */
const MONTHLY_KEYS = new Set(["viewers", "coupons", "stamps", "revisit"]);

/** 보내기 전에 잡는다. 찜·단골(누적)만 남은 보고서는 그 달 이야기가 없어 내보내지 않는다. */
export function storeMissing(data: Json): string[] {
  const out: string[] = [];
  const r = (data.report ?? {}) as Record<string, unknown>;
  const s = (data.store ?? {}) as Record<string, unknown>;
  if (!r.label) out.push("보고 기간 이름");
  if (!r.generated_at) out.push("작성일");
  if (!s.name) out.push("가게 이름");
  const groups = (data.groups ?? []) as { cards?: { key: string }[] }[];
  const monthly = groups.flatMap((g) => g.cards ?? []).filter((c) => MONTHLY_KEYS.has(c.key));
  if (monthly.length === 0) out.push("이 달 앱 기록(가게 화면 열람·쿠폰·스탬프)이 없습니다 — 이대로는 빈 종이가 나갑니다");
  return out;
}
