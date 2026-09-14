/**
 * 느슨한 날짜 문자열 다루기.
 *
 * 시트에서 넘어온 날짜는 "8/6(목) 14시" · "9월 4일" · "2026-09-04" 처럼 제각각이다.
 * 사람이 적은 것이라 통일할 수 없다. 그래서 **읽을 때만 느슨하게 읽고, 쓸 때는 한 가지로 쓴다.**
 * 못 읽으면 조용히 빠진다 — 지어내지 않는다.
 */

/** "2026-09-04" · "9/4" · "9월 4일" · "8/6(목) 14시" → "YYYY-MM-DD". 연도가 없으면 기준 연도. */
export function looseToISO(s: string | null | undefined, year: number = new Date().getFullYear()): string | null {
  if (!s) return null;
  let m = s.match(/(\d{4})[-./]\s?(\d{1,2})[-./]\s?(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/(\d{1,2})\s*[/월]\s*(\d{1,2})/);
  if (m && Number(m[1]) <= 12 && Number(m[2]) <= 31) return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}
