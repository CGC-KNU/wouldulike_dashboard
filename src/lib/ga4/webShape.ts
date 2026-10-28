/**
 * Probe · 웹 지표 — GA4 응답을 화면 숫자로 바꾸는 순수 함수(네트워크 없음, tests/webShape.test.ts).
 *
 * 1028 A: 방문자 절반이 미국 데이터센터 도시(Ashburn · Boardman …)에서 참여 0 으로 찍혔다 — 링크 미리보기 · 검수 봇으로 본다.
 * 그래서 머리 숫자는 한국(countryId=KR)만 세고, 뺀 해외 수는 따로 보인다. 숨기지 않고 「뺐다」고 말한다.
 */

/** 페이지 이름 — 호스트 + 경로. 끝 슬래시는 떼고 센다(/students 와 /students/ 는 같은 페이지) */
export const PAGE_LABEL: Record<string, string> = {
  "wouldulike.kr/": "사장님 홈",
  "wouldulike.kr/students": "학생 소개",
  "app.wouldulike.kr/join": "입점 신청",
};

export function pageKey(host: string, path: string): string {
  const h = host.replace(/^www\./, "");
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return `${h}${p || "/"}`;
}

/** 앱 설치 버튼 — 향상된 측정 `click` 의 link_domain 으로 가른다. 그 밖의 바깥 링크(인스타 등)는 null */
export function storeOf(linkDomain: string): "ios" | "android" | null {
  const d = linkDomain.toLowerCase();
  if (d === "apps.apple.com" || d === "itunes.apple.com") return "ios";
  if (d === "play.google.com") return "android";
  return null;
}

export interface WebPage { key: string; label: string; users: number; views: number }

/** 같은 페이지(끝 슬래시 차이)를 합친다. 사람 수는 합치면 겹칠 수 있어 큰 쪽을 쓴다 — 조회수만 더한다 */
export function mergePages(rows: { host: string; path: string; users: number; views: number }[]): WebPage[] {
  const m = new Map<string, WebPage>();
  for (const r of rows) {
    const key = pageKey(r.host, r.path);
    const cur = m.get(key);
    if (cur) { cur.users = Math.max(cur.users, r.users); cur.views += r.views; }
    else m.set(key, { key, label: PAGE_LABEL[key] ?? key, users: r.users, views: r.views });
  }
  return [...m.values()].sort((a, b) => b.views - a.views);
}

export interface WebFunnel {
  /** 사장님 홈 방문자 */
  home: number;
  /** 신청 페이지(/join) 도착 */
  join: number;
  /** 신청 단계를 하나라도 넘긴 사람(signup_step_complete) */
  step: number;
  /** 신청 완료(sign_up — 제출 성공 뒤) */
  signup: number;
}

/**
 * 입점 신청 깔때기 — 단계마다 **따로 센 사람 수**다. 같은 사람을 이은 것이 아니다:
 * DM · QR 링크(`/join?src=dm`)는 홈을 거치지 않고 신청 페이지로 바로 온다. 그래서 뒷단이 앞단보다 클 수 있다.
 */
export function buildFunnel(pages: WebPage[], events: { name: string; users: number }[]): WebFunnel {
  const pu = (key: string) => pages.find((p) => p.key === key)?.users ?? 0;
  const eu = (name: string) => events.find((e) => e.name === name)?.users ?? 0;
  return { home: pu("wouldulike.kr/"), join: pu("app.wouldulike.kr/join"), step: eu("signup_step_complete"), signup: eu("sign_up") };
}

export interface StoreClicks { ios: number; android: number; byPage: { key: string; label: string; ios: number; android: number }[] }

export function storeClicks(rows: { linkDomain: string; host: string; path: string; count: number }[]): StoreClicks {
  const out: StoreClicks = { ios: 0, android: 0, byPage: [] };
  for (const r of rows) {
    const s = storeOf(r.linkDomain);
    if (!s) continue;
    out[s] += r.count;
    const key = pageKey(r.host, r.path);
    let p = out.byPage.find((x) => x.key === key);
    if (!p) { p = { key, label: PAGE_LABEL[key] ?? key, ios: 0, android: 0 }; out.byPage.push(p); }
    p[s] += r.count;
  }
  out.byPage.sort((a, b) => b.ios + b.android - (a.ios + a.android));
  return out;
}

/** 28일 일별 — 방문이 없는 날은 행이 없어 0 으로 채운다(웹은 방문이 없으면 실제로 0 이다). dates 는 오래된 날부터 */
export function fillDays(dates: string[], rows: { date: string; users: number; sessions: number }[]) {
  const by = new Map(rows.map((r) => [r.date, r] as const));
  return dates.map((d) => {
    const r = by.get(d.replace(/-/g, ""));
    return { date: d, users: r?.users ?? 0, sessions: r?.sessions ?? 0 };
  });
}
