/**
 * 인스타 성과 추이 화면의 순수 계산 — 축 끝값, 달 경계, x 축 이름.
 * 화면(InsightsSummary.tsx)에서 빼 둔 이유: 그림은 눈으로 보지만 이 셋은 틀려도 눈에 잘 안 띈다.
 */

/** 점 그림이 보여 주는 기간(이번 달 포함). 그 전 게시물은 발행 수 막대와 월별 표에만 있다. */
export const DOT_MONTHS = 6;

/** 축 끝을 깔끔한 값으로 — 1·2·2.5·5 × 10ⁿ 중 max 이상인 가장 작은 것. 값이 없으면 1. */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

/** 축 눈금 — 끝·가운데·0. 가운데가 정수가 아니면(끝이 25 등) 끝과 0 만 — 「12.5건」 같은 눈금은 없다. */
export function axisTicks(top: number): number[] {
  return Number.isInteger(top / 2) ? [top, top / 2, 0] : [top, 0];
}

/** "2026-09" → 그 달 1일 0시와 다음 달 1일 0시(KST)의 epoch ms. 게시 시각이 KST 로 오므로 경계도 KST 로 잡는다. */
export function monthBounds(period: string): [number, number] {
  const [y, m] = period.split("-").map(Number);
  const iso = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01T00:00:00+09:00`;
  return [Date.parse(iso(y, m)), Date.parse(m === 12 ? iso(y + 1, 1) : iso(y, m + 1))];
}

/**
 * 월별 막대의 x 축 이름 — 첫 달·1월·마지막 달만 "YY.M". 스무 개 넘는 막대 밑에 전부 쓰면 겹친다.
 * 나머지 달은 막대에 올리면(툴팁) 보이고, 월별 표에도 있다.
 */
export function monthTick(period: string, i: number, count: number): string | null {
  const [y, m] = period.split("-").map(Number);
  if (i === 0 || i === count - 1 || m === 1) return `${String(y).slice(2)}.${m}`;
  return null;
}

/** 조회수 축 숫자 — 만 단위가 넘으면 「1.2만」 */
export function compactKo(v: number): string {
  return v >= 10_000 ? new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(v) : v.toLocaleString("ko-KR");
}
