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

/**
 * 느슨한 문자열에서 시각만 뽑는다 — "2026-09-19 14:00", "9/19 오후 2시", ISO 시각 모두.
 * 날짜만 적힌 값이면 null 이다: **시각을 모르는 것과 0시는 다르다.**
 */
export function looseToHHMM(s: string | null | undefined): string | null {
  if (!s) return null;
  // ISO 시각(…T01:11:17Z)은 UTC 다 — 보는 사람 시간대로 옮긴다
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  /** "오후 2:30" 은 14:30 이다. 24시간 표기("14:30")에는 오전·오후가 안 붙으므로 12 미만일 때만 옮긴다. */
  const shift = (n: number): number => {
    if (/오후/.test(s) && n < 12) return n + 12;
    if (/오전/.test(s) && n === 12) return 0;
    return n;
  };
  const m = s.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return `${String(shift(Number(m[1]))).padStart(2, "0")}:${m[2]}`;
  // "오후 2시" · "14시" · "2시 30분"
  const h = s.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (h) {
    const n = shift(Number(h[1]));
    const min = h[2] && Number(h[2]) < 60 ? h[2].padStart(2, "0") : "00";
    if (n < 24) return `${String(n).padStart(2, "0")}:${min}`;
  }
  return null;
}
