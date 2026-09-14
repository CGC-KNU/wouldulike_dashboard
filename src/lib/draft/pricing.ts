import type { Campus, PlanTier } from "./types";

/**
 * 플랜 기본 월 이용료 — **부가세 포함**, 캠퍼스별 (민열님 0914).
 *
 * ## 왜 캠퍼스별인가
 *
 * 경북대는 우리가 이미 자리를 잡았고, 영남대·계명대는 앵커 매장부터 들어가는 단계라
 * 같은 Boost 라도 받는 값이 다르다. 시트에 손으로 적다 보면 33,000 을 그대로 복사해
 * 붙이게 되고, 그러면 새 상권의 단가가 조용히 옛 상권 값으로 내려앉는다.
 *
 * ## 기본값이지 고정값이 아니다
 *
 * **여기 값은 처음 채워 주는 숫자일 뿐이고, 매장마다 고칠 수 있다.**
 * 실제로 정든밤은 22,000원으로 계약했다. 예외가 이미 있는데 값을 잠그면
 * 사람은 툴을 우회해서 시트로 돌아간다.
 *
 * CONTENT(프리미엄)는 매장마다 제작 범위가 달라 정가가 없다 — 여기 적지 않는다.
 * 없는 값을 적어 두면 견적이 그 숫자에 끌려간다.
 */

export const PLAN_FEE: Partial<Record<PlanTier, Partial<Record<string, number>>>> = {
  BOOST: {
    경북대: 33_000,
    영남대: 49_500,
    계명대: 49_500,
  },
  FREE: { 경북대: 0, 영남대: 0, 계명대: 0 },
};

/** 그 캠퍼스에 값이 없으면 경북대 값을 쓴다 — 새 상권이 생겨도 0 원으로 떨어지지 않게. */
const FALLBACK_CAMPUS = "경북대";

/**
 * 플랜과 캠퍼스로 기본 월 이용료를 고른다. 정해진 값이 없으면 `null` —
 * 화면은 빈 칸으로 두고 사람이 적는다. 모르는 값을 0 으로 채우지 않는다.
 */
export function defaultMonthlyFee(tier: string | null | undefined, campus: Campus | null | undefined): number | null {
  if (!tier) return null;
  const byCampus = PLAN_FEE[tier as PlanTier];
  if (!byCampus) return null;
  const v = byCampus[campus ?? FALLBACK_CAMPUS] ?? byCampus[FALLBACK_CAMPUS];
  return typeof v === "number" ? v : null;
}

/** "BOOST · 영남대 기본 49,500원" 같은 한 줄. 입력 칸 밑에 붙여 어디서 온 숫자인지 밝힌다. */
export function feeHint(tier: string | null | undefined, campus: Campus | null | undefined): string | undefined {
  const v = defaultMonthlyFee(tier, campus);
  if (v === null || v === 0) return undefined;
  return `${tier} · ${campus ?? FALLBACK_CAMPUS} 기본 ${v.toLocaleString()}원 (VAT 포함). 매장마다 고칠 수 있습니다.`;
}
