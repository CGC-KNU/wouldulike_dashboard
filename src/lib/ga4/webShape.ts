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
  /** 입점 신청 버튼을 누른 사람(cta_type=signup) — 등록(1028) 전 클릭은 빠진다 */
  click?: number;
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

/**
 * 1028 B1: 이벤트 매개변수를 맞춤 측정기준으로 등록했다(cta_type · cta_location · section_id · lead_source · step_name · plan).
 * 등록 전에 찍힌 이벤트는 값이 `(not set)` 으로 온다 — 0 도 아니고 다른 값도 아니라 「등록 전」으로 따로 센다.
 */
export const NOT_SET = "(not set)";

/** 홈 섹션 — 화면 위에서부터의 순서(wouldulike.kr `main section[id]`) */
export const SECTIONS: [string, string][] = [
  ["app-intro", "앱 소개"], ["why", "왜 우주라이크"], ["grow", "함께하는 가게"], ["kit", "입점 키트"], ["steps", "입점 순서"],
  ["compare", "다른 홍보와 비교"], ["plans", "요금제"], ["content", "만드는 콘텐츠"], ["spot", "스팟 제작"], ["deck", "소개서"],
  ["faq", "자주 묻는 질문"], ["app", "학생 화면"], ["contact", "상담 신청"],
];
/** 버튼 위치 — 섹션 id 이거나, 섹션 밖 고정 버튼의 클래스 */
const LOCATION_KO: Record<string, string> = { dbar: "상단 고정 바", msticky: "모바일 하단 버튼", page: "기타" };
export const locationLabel = (v: string) => LOCATION_KO[v] ?? SECTIONS.find(([k]) => k === v)?.[1] ?? v;

/** 입점 신청 단계 — `signup_step_complete` 는 **그 단계를 마치고 다음으로 넘어갈 때** 찍힌다(JoinClient `go`). 약관은 sign_up 이 대신한다 */
export const STEPS: [string, string][] = [
  ["intro", "소개 넘김"], ["store", "매장 정보"], ["owner", "사장님 · 카카오 로그인"], ["plan", "플랜 고르기"], ["benefit", "혜택 적기"], ["pin", "PIN 정하기"],
];

export interface Split { value: string; label: string; count: number; users: number }
export interface Splits { rows: Split[]; unset: { count: number; users: number } }

/** 값별로 나누고 `(not set)` 은 따로 뺀다. order 가 있으면 그 순서(없는 값은 0 으로 채움), 모르는 값은 뒤에 큰 순 */
export function splitBy(rows: { value: string; count: number; users: number }[], label: (v: string) => string, order?: string[]): Splits {
  const unset = { count: 0, users: 0 };
  const m = new Map<string, Split>();
  for (const r of rows) {
    if (r.value === NOT_SET || r.value === "") { unset.count += r.count; unset.users = Math.max(unset.users, r.users); continue; }
    const cur = m.get(r.value);
    if (cur) { cur.count += r.count; cur.users = Math.max(cur.users, r.users); }
    else m.set(r.value, { value: r.value, label: label(r.value), count: r.count, users: r.users });
  }
  const known = (order ?? []).map((v) => m.get(v) ?? { value: v, label: label(v), count: 0, users: 0 });
  const rest = [...m.values()].filter((s) => !order?.includes(s.value)).sort((a, b) => b.count - a.count);
  return { rows: [...known, ...rest], unset };
}

const pick = (list: [string, string][]) => (v: string) => list.find(([k]) => k === v)?.[1] ?? v;
export const sectionSplit = (rows: { value: string; count: number; users: number }[]) => splitBy(rows, pick(SECTIONS), SECTIONS.map(([k]) => k));
export const stepSplit = (rows: { value: string; count: number; users: number }[]) => splitBy(rows, pick(STEPS), STEPS.map(([k]) => k));
export const ctaTypeSplit = (rows: { value: string; count: number; users: number }[]) =>
  splitBy(rows, (v) => ({ signup: "입점 신청 버튼", consult: "상담 버튼" })[v] ?? v, ["signup", "consult"]);
export const leadSplit = (rows: { value: string; count: number; users: number }[]) =>
  splitBy(rows, (v) => ({ consult: "입점 상담", spot: "스팟 견적" })[v] ?? v, ["consult", "spot"]);
export const planSplit = (rows: { value: string; count: number; users: number }[]) =>
  splitBy(rows, (v) => ({ FREE: "무료", BOOST: "Boost", PREMIUM: "Premium" })[v] ?? v, ["FREE", "BOOST", "PREMIUM"]);
export const locationSplit = (rows: { value: string; count: number; users: number }[]) => splitBy(rows, locationLabel);

/**
 * 유입 — GA4 채널 그룹은 카카오톡 · QR 처럼 GA4 가 모르는 출처를 전부 「Unassigned」로 뭉친다.
 * 그래서 출처 / 매체(utm_source / utm_medium)로도 나눠 보인다. 공유 링크 규칙(1029) — 인스타 프로필이 이미 쓰던
 * `instagram / social / partner-always` 방식에 맞춰 매체는 social, 어디서 보냈는지는 캠페인으로 가른다:
 * 인스타 DM instagram/social/dm · 카카오톡 kakao/social/dm · 전단 QR qr/offline/<캠퍼스>(QR 은 GA4 묶음에 없어 「분류 없음」).
 */
const SOURCE_KO: Record<string, string> = {
  "(direct) / (none)": "직접 입력 · 출처 없는 링크",
  "instagram / social": "인스타그램", "l.instagram.com / referral": "인스타 앱(자동 분류)", "m.facebook.com / referral": "페이스북 · 인스타 앱 브라우저",
  "kakao / social": "카카오톡", "kakao / message": "카카오톡", "qr / offline": "전단 · QR",
  "google / organic": "구글 검색", "naver / organic": "네이버 검색", "m.search.naver.com / referral": "네이버 검색", "search.naver.com / referral": "네이버 검색",
};
export const sourceLabel = (source: string, medium: string) => SOURCE_KO[`${source} / ${medium}`] ?? `${source} / ${medium}`;

export interface SourceRow { key: string; label: string; sessions: number; campaigns: string[] }
/** 채널 그룹별 합과 출처 / 매체별 합을 한 표에서 낸다. 세션은 더해도 된다(사람 수는 겹쳐 더하지 않는다). 괄호 캠페인((not set) 등)은 뺀다 */
export function summarizeTraffic(rows: { channel: string; source: string; medium: string; campaign: string; sessions: number }[]) {
  const ch = new Map<string, number>();
  const src = new Map<string, SourceRow>();
  for (const r of rows) {
    ch.set(r.channel, (ch.get(r.channel) ?? 0) + r.sessions);
    const key = `${r.source} / ${r.medium}`;
    const s = src.get(key) ?? { key, label: sourceLabel(r.source, r.medium), sessions: 0, campaigns: [] };
    s.sessions += r.sessions;
    if (r.campaign && !r.campaign.startsWith("(") && !s.campaigns.includes(r.campaign)) s.campaigns.push(r.campaign);
    src.set(key, s);
  }
  return {
    channels: [...ch.entries()].map(([channel, sessions]) => ({ channel, sessions })).sort((a, b) => b.sessions - a.sessions),
    sources: [...src.values()].sort((a, b) => b.sessions - a.sessions),
  };
}

/** KST 의 오늘에서 n 일 전 날짜(YYYY-MM-DD) */
export function kstDaysAgo(n: number, now = Date.now()): string {
  const kst = new Date(now + 9 * 3_600_000);
  kst.setUTCDate(kst.getUTCDate() - n);
  return kst.toISOString().slice(0, 10);
}

/**
 * Search Console — 검색어가 가려진 몫. 구글은 검색량이 적은 검색어를 개인정보 보호로 빼고 준다.
 * 전체(측정기준 없이 센 합)에서 검색어 줄의 합을 빼면 그 몫이다. 음수는 0 으로(반올림 · 지연 차이).
 */
export function hiddenQueries(total: { clicks: number; impressions: number }, rows: { clicks: number; impressions: number }[]) {
  const sum = rows.reduce((a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions }), { clicks: 0, impressions: 0 });
  return { clicks: Math.max(0, total.clicks - sum.clicks), impressions: Math.max(0, total.impressions - sum.impressions) };
}

/** 28일 일별 — 방문이 없는 날은 행이 없어 0 으로 채운다(웹은 방문이 없으면 실제로 0 이다). dates 는 오래된 날부터 */
export function fillDays(dates: string[], rows: { date: string; users: number; sessions: number }[]) {
  const by = new Map(rows.map((r) => [r.date, r] as const));
  return dates.map((d) => {
    const r = by.get(d.replace(/-/g, ""));
    return { date: d, users: r?.users ?? 0, sessions: r?.sessions ?? 0 };
  });
}
