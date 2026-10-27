/**
 * 허블(Hubble · 파트너 탐색) — 데이터 모양 (1010).
 *
 * 값은 전부 백엔드 문서 `hubble:<key>` 에 있다(이 저장소는 공개라 매장 데이터를 코드에 두지 않는다).
 *   campuses   대학가 목록 — 전국 4년제 캠퍼스, 정문 1km 영업 중 식당 · 카페 · 주점 수, 100곳 컷
 *   c:<key>    한 상권 매장 — 행안부 인허가(일반 · 휴게 · 제과) 원장에서 만든 것, 주 1회 다시 만든다
 *   changes    주간 갱신이 쌓는 변동(최근 8주) — scripts/hubble/sync.py(백엔드 저장소)
 *   o:<key>    한 상권 팀 입력 — 관찰 등급 · 메모 · 사장님 성향(주간 갱신이 지우지 않게 따로 둔다)
 * 카카오 · 네이버 응답값(평점 · 리뷰 · 메뉴 · 영업시간)은 약관상 저장하지 않는다 — 화면에서 링크로만 연다.
 */

export type Grade = "S" | "A" | "B" | "C";

export interface CampusItem {
  key: string;            // 10자리 해시 — 문서 키
  id: string;             // 학교:본교|분교|제2캠퍼:시도
  name: string;
  branch: string;
  type: string;           // 대학교 · 교육대학 · 산업대학
  sido: string;
  addr: string;
  y: number; x: number;   // 위도 · 경도(정문 보정 전엔 캠퍼스 대표 좌표)
  gate: "manual" | "wikidata" | "osm" | null;
  gates?: { n: string; y: number; x: number }[];   // 문마다 1km(1011 정문 보정) — 없으면 y · x 하나
  n: number;              // 정문 1km 안 영업 중 매장
  kinds: Record<string, number>;
  sa: number;             // 적합 S · A 수
  below: boolean;         // 100곳 미만 — 파트너 상권 기준 미달
  cluster: string;        // 정문 2km 안 묶음의 대표 key
}

export interface CampusesDoc {
  built_at: string;
  new_since?: string;
  fit_version: number;
  radius_m: number;
  cut: number;
  sources: string[];
  items: CampusItem[];
  no_coord: { id: string; name: string; branch: string; sido: string; addr: string }[];
}

/** 매장 한 줄 — 짧은 키(문서 크기 때문) */
export interface Store {
  id: string;   // 인허가 관리번호
  k: "일" | "휴" | "제";   // 일반음식점 · 휴게음식점 · 제과점
  n: string;    // 상호
  c: string;    // 업태
  a: string;    // 주소
  t: string;    // 전화
  o: string;    // 인허가일
  y: number; x: number;
  d: number;    // 정문 거리(m) — 문이 여럿이면 가장 가까운 문
  gn?: string;  // 그 문 이름(문이 여럿일 때만)
  ch: string | null;   // 프랜차이즈 브랜드(이름 대조)
  dn: number;   // 반경 약 50m 매장 수(골목 집적도)
  g: Grade; sc: number;
  p: { indep: number; dense: number; dist: number; new: number; age?: number; kind?: number };   // v1 은 age, v2(1011) 는 kind
  ig?: Ig;      // 인스타그램(1020) — 매장이 네이버 플레이스에 스스로 건 링크, 없으면 팀이 Astro 후보에 적은 핸들(1028, src "team"). 없으면 못 찾은 것(없다는 뜻은 아님)
}

/** 인스타 — 백엔드 scripts/hubble/ig_enrich.py 가 모아 주간 갱신이 붙인다. 팔로워 · 마지막 게시는 Meta business_discovery(비즈니스 계정만) */
export interface Ig {
  handle: string;
  url: string;
  kind: "비즈니스" | "개인 계정(확인 필요)" | "확인 실패" | "미확인";
  followers?: number;
  last_post?: string;   // YYYY-MM-DD(KST)
  checked: string;      // 확인한 날
  sig?: IgSig;          // 광고 흔적(1027) — 옛 데이터엔 없다
  src?: "team";         // 1028 네이버 링크가 아니라 팀이 Astro 후보 인스타 칸에 적은 핸들
}

/**
 * 광고 흔적(1027, 애딧 Lens 「광고 흔적」) — 매장 계정 최근 게시물 최대 12편의 캡션에서 센 숫자만 온다(캡션은 저장하지 않음).
 * 이미 협찬 · 체험단에 돈을 쓰거나 이벤트를 하는 곳이 스팟 제작 · Premium 제안의 첫 줄. 키는 하나씩 빠질 수 있다.
 */
export interface IgSig {
  sponsor?: number;               // 협찬 · 체험단 · 광고 표시가 있는 게시물 수
  sponsor_last?: string | null;   // 그중 가장 최근 게시일 YYYY-MM-DD
  event?: number;                 // 이벤트 · 증정 · 추첨 게시물 수
  recent30?: number;              // 최근 30일 게시물 수
  engage?: number;                // 좋아요 + 댓글 중앙값
}
export const SIG_HELP = "광고 흔적 = 매장 인스타 최근 게시물 최대 12편의 캡션에서 협찬 · 체험단 · 광고 표시를 센 것(캡션은 저장하지 않고 숫자만). 이미 홍보에 돈을 쓰는 곳이라 스팟 제작 · Premium 제안 우선순위.";
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
export const igSponsor = (s: Pick<Store, "ig">) => (num(s.ig?.sig?.sponsor) ?? 0) > 0;
export const igEvent = (s: Pick<Store, "ig">) => (num(s.ig?.sig?.event) ?? 0) > 0;
/** 서랍 한 줄 조각 — 있는 값만. sig 가 없거나 비면 빈 배열 */
export function sigParts(sig: IgSig | undefined | null): string[] {
  if (!sig || typeof sig !== "object") return [];
  const out: string[] = [];
  const sp = num(sig.sponsor), ev = num(sig.event), r30 = num(sig.recent30), en = num(sig.engage);
  const last = typeof sig.sponsor_last === "string" && /^\d{4}-\d{2}-\d{2}/.test(sig.sponsor_last) ? `${Number(sig.sponsor_last.slice(5, 7))}/${Number(sig.sponsor_last.slice(8, 10))}` : null;
  if (sp !== undefined) out.push(sp > 0 ? `협찬 · 체험단 흔적 ${sp}편${last ? ` (최근 ${last})` : ""}` : "협찬 · 체험단 흔적 없음");
  if (ev !== undefined && ev > 0) out.push(`이벤트 ${ev}편`);
  if (r30 !== undefined) out.push(`최근 30일 ${r30}편`);
  if (en !== undefined) out.push(`반응 중앙값 ${Math.round(en).toLocaleString()}`);
  return out;
}
/** 광고 흔적순 — 협찬 흔적 많은 순, 같으면 반응(중앙값) 높은 순 */
export const sigCompare = (a: Pick<Store, "ig">, b: Pick<Store, "ig">) =>
  (num(b.ig?.sig?.sponsor) ?? 0) - (num(a.ig?.sig?.sponsor) ?? 0) || (num(b.ig?.sig?.engage) ?? -1) - (num(a.ig?.sig?.engage) ?? -1);
/** 최근 days 일 안에 게시 — 확인한 날이 아니라 오늘 기준 */
export const igRecent = (s: Pick<Store, "ig">, days = 30) =>
  Boolean(s.ig?.last_post) && s.ig!.last_post! >= new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);

export interface StoresDoc { campus: string; built_at: string; fit_version: number; stores: Store[] }

export interface Obs { grade?: Grade; why?: string; mood?: "마당발" | "보통" | "모름"; memo?: string; by?: string; at?: string }
export interface ObsDoc { obs: Record<string, Obs>; notes?: { by: string; at: string; text: string }[] }

export const KIND_LABEL: Record<Store["k"], string> = { 일: "음식점", 휴: "카페 · 분식", 제: "제과" };
export const GRADE_COLOR: Record<Grade, string> = { S: "#060073", A: "#4B45C6", B: "#9FA5C4", C: "#C9CCD8" };

/** 팀 관찰을 합친 등급 — 공공 원장 점수(최대 75) + 팀 관찰 S 25 · A 18 · B 10 · C 0. 컷은 v2 원장 컷(65 · 51 · 39)에 팀 관찰 B 만큼 더한 자리 */
export function finalGrade(s: Store, o?: Obs): { g: Grade; sc: number } {
  if (!o?.grade) return { g: s.g, sc: s.sc };
  const add = { S: 25, A: 18, B: 10, C: 0 }[o.grade];
  const sc = s.sc + add;
  return { g: sc >= 75 ? "S" : sc >= 61 ? "A" : sc >= 49 ? "B" : "C", sc };
}

export const years = (o: string) => (o && /^\d{4}/.test(o) ? new Date().getFullYear() - Number(o.slice(0, 4)) : null);
/** 90일 안 인허가 — 수집 배치(hubble_build.NEW_SINCE)와 같은 기준 */
const NEW_SINCE = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10).replaceAll("-", "");
export const isNew = (o: string) => Boolean(o) && o.replaceAll("-", "") >= NEW_SINCE;
export const normName = (s: string) => s.replace(/\s+|\(.*?\)|주식회사|㈜/g, "").toLowerCase();
/** ASTRO 후보의 캠퍼스 칸(10자) — 「경북대학교」→「경북대」, 분교는 뒤에 캠퍼스 표시 */
export const shortCampus = (c: Pick<CampusItem, "name" | "branch">) => (c.name.replace(/대학교$/, "대").replace(/교육대$/, "교대") + (c.branch !== "본교" ? `(${c.branch.replace("캠퍼", "캠")})` : "")).slice(0, 10);
export const kakaoSearch = (s: Pick<Store, "n" | "a">) => `https://map.kakao.com/?q=${encodeURIComponent(`${s.n} ${s.a.split(" ").slice(0, 3).join(" ")}`)}`;
export const naverSearch = (s: Pick<Store, "n" | "a">) => `https://map.naver.com/p/search/${encodeURIComponent(`${s.n} ${s.a.split(" ").slice(0, 2).join(" ")}`)}`;

/** 주간 변동 한 줄 — 백엔드 scripts/hubble/sync.py 가 쓴다 */
export type ChangeKind = "신규 오픈" | "새로 잡힘" | "폐업" | "빠짐" | "상호 변경" | "업태 변경" | "기준 통과" | "기준 미달" | "정문 보정";
export interface Change { c: string; cn: string; kind: ChangeKind; id: string; n: string; cat?: string; d?: number; prev?: string; at?: string }
export interface ChangeWeek {
  built_at: string; first: boolean; count: Partial<Record<ChangeKind, number>>; total: number; items: Change[]; cut: number;
  run: { campuses: number; uploaded: number; unchanged: number; stores: number };
}
export interface ChangesDoc { weeks: ChangeWeek[] }

/** 허블 매장 ↔ 이미 파트너 · 이미 후보 (1011). 화면이 열릴 때 ASTRO 목록과 이름으로 맞춘다 — 원장 문서엔 안 박는다(계약은 매일 바뀐다). */
export type Tie =
  | { kind: "partner"; rid: number; name: string }
  | { kind: "lead"; id: string; name: string; stage: string; owner: string | null };
export interface PartnerRow { restaurant_id: number; name: string; is_affiliate: boolean | null }
export interface LeadRow { id: string | number; name: string; stage: string; owner: string | null; campus?: string | null; memo?: string | null; converted_restaurant_id?: number | null }

// 지점 꼬리 — 「랜돌프비어 대구계명대점」 「BHC 경대북문점」 「고씨네 대구경북대본점」. 브랜드 글자를 먹지 않게 알려진 말만 뗀다.
const TAIL = /(?:대구|경산|경북대|경대|계명대|계대|영남대|영대|대구대|북문|정문|남문|동문|서문|후문|쪽문|캠퍼스|역)+본?점$|본점$/;   // 「연화반점」의 반점은 안 뗀다
// 꼬리에 캠퍼스가 적혀 있으면 그 상권에서만 맞춘다 — 「고운라멘 영남대점」이 경북대 북문 고운라멘에 붙지 않게(1009 #220 교훈)
const HINT: [RegExp, string][] = [[/경북대|경대/, "경북대"], [/계명대|계대/, "계명대"], [/영남대|영대|경산/, "영남대"]];
const hint = (n: string) => { const t = normName(n).match(TAIL)?.[0] ?? ""; return HINT.find(([r]) => r.test(t))?.[1] ?? null; };
const key = (n: string) => normName(n).replace(TAIL, "");
function hits(stores: Store[], name: string) {
  const k = key(name);
  if (k.length < 2) return [];
  const out = stores.filter((s) => {
    const n = normName(s.n), nk = key(s.n);
    return n === k || nk === k || (k.length >= 3 && (n.startsWith(k) || (nk.length >= 3 && k.startsWith(nk) && nk.length >= k.length - 1)));
  });
  return out.length <= 2 ? out : [];   // 셋 이상 걸리면 흔한 이름 — 표시하지 않는다
}

export function matchTies(stores: Store[], partners: PartnerRow[], leads: LeadRow[], campus: string): Record<string, Tie> {
  const out: Record<string, Tie> = {};
  const here = (name: string, c?: string | null) => { const h = c || hint(name); return !h || campus.startsWith(h); };
  for (const l of leads) {
    if (l.stage === "거절") continue;
    const byId = l.memo?.match(/인허가 (\S+)/)?.[1];
    const found = byId ? stores.filter((s) => s.id === byId) : here(l.name, l.campus) ? hits(stores, l.name) : [];
    for (const s of found) out[s.id] = { kind: "lead", id: String(l.id), name: l.name, stage: l.stage, owner: l.owner };
  }
  for (const p of partners) {
    if (p.is_affiliate === false || !here(p.name)) continue;
    for (const s of hits(stores, p.name)) out[s.id] = { kind: "partner", rid: p.restaurant_id, name: p.name };   // 파트너가 후보보다 앞선다
  }
  return out;
}
