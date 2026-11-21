/**
 * 재무 열람 권한 — 민열 · 재민 두 사람만.
 *
 * 부서 권한(can_marketing · can_restaurants)이 아니라 **사람**으로 막는다. 재무는 부서가 아니라
 * 공동대표 둘이 보는 화면이라서다. 이름은 바꿀 수 있지만 계정 아이디(username)는 그대로라
 * 표시 이름이 아니라 아이디로 판정한다(Atlas 명단의 username 과 같은 값).
 *
 * 막는 곳이 세 겹이다 — 화면(사이드바에서 숨김) · Next 라우트(`requireFinance`) · 백엔드(finance 앱).
 * 화면만 막으면 주소를 직접 치는 사람을 못 막는다.
 */
export const FINANCE_VIEWERS = ["minyeol", "jaemin"] as const;

export function canViewFinance(username: string | null | undefined): boolean {
  if (!username) return false;
  const u = username.trim().toLowerCase();
  return (FINANCE_VIEWERS as readonly string[]).includes(u);
}
