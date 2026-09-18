/**
 * 앱 캠페인 주간 — 마일리지 2배 · 한정쿠폰.
 *
 * **원본은 백엔드 `astro/campaigns.py` 한 곳이다.** 여기는 그걸 읽어다 달력에 놓는 코드만
 * 있고 날짜는 없다 — 두 곳에 각각 적어 두면 한쪽만 고치고 끝나는 날이 온다.
 * 슬랙 알림도 같은 표를 본다.
 */

export type CampaignKind = "mileage_2x" | "coupon_week";

export interface CampaignWeek {
  kind: CampaignKind;
  label: string;
  /** "YYYY-MM-DD" · 월요일 */
  start: string;
  /** "YYYY-MM-DD" · 일요일 */
  end: string;
}

/** 그 달에 걸치는 날짜만 뽑는다. 주가 달을 넘어가면(9/28~10/4) 양쪽 달에 다 나온다. */
export function daysInMonth(c: CampaignWeek, ym: string): string[] {
  const out: string[] = [];
  const d = new Date(`${c.start}T00:00:00`);
  const last = new Date(`${c.end}T00:00:00`);
  while (d <= last) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (iso.startsWith(ym)) out.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** "9/28~10/4" — 사람이 읽는 기간 표기. */
export function spanLabel(c: CampaignWeek): string {
  const [, sm, sd] = c.start.split("-");
  const [, em, ed] = c.end.split("-");
  return `${Number(sm)}/${Number(sd)}~${Number(em)}/${Number(ed)}`;
}
