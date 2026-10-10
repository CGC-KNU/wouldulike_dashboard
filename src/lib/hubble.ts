/**
 * 허블(Hubble · 파트너 탐색) — 데이터 모양 (1010).
 *
 * 값은 전부 백엔드 문서 `hubble:<key>` 에 있다(이 저장소는 공개라 매장 데이터를 코드에 두지 않는다).
 *   campuses   대학가 목록 — 전국 4년제 캠퍼스, 정문 1km 영업 중 식당 · 카페 · 주점 수, 100곳 컷
 *   c:<key>    한 상권 매장 — 행안부 인허가(일반 · 휴게 · 제과) 원장에서 만든 것, 주 1회 다시 만든다
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
  n: number;              // 정문 1km 안 영업 중 매장
  kinds: Record<string, number>;
  sa: number;             // 적합 S · A 수
  below: boolean;         // 100곳 미만 — 파트너 상권 기준 미달
  cluster: string;        // 정문 2km 안 묶음의 대표 key
}

export interface CampusesDoc {
  built_at: string;
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
  d: number;    // 정문 거리(m)
  ch: string | null;   // 프랜차이즈 브랜드(이름 대조)
  dn: number;   // 반경 약 50m 매장 수(골목 집적도)
  g: Grade; sc: number;
  p: { indep: number; dense: number; age: number; dist: number; new: number };
}

export interface StoresDoc { campus: string; built_at: string; fit_version: number; stores: Store[] }

export interface Obs { grade?: Grade; why?: string; mood?: "마당발" | "보통" | "모름"; memo?: string; by?: string; at?: string }
export interface ObsDoc { obs: Record<string, Obs>; notes?: { by: string; at: string; text: string }[] }

export const KIND_LABEL: Record<Store["k"], string> = { 일: "음식점", 휴: "카페 · 분식", 제: "제과" };
export const GRADE_COLOR: Record<Grade, string> = { S: "#060073", A: "#4B45C6", B: "#9FA5C4", C: "#C9CCD8" };

/** 팀 관찰을 합친 등급 — 공공 원장 점수(최대 75) + 팀 관찰 S 25 · A 18 · B 10 · C 0 */
export function finalGrade(s: Store, o?: Obs): { g: Grade; sc: number } {
  if (!o?.grade) return { g: s.g, sc: s.sc };
  const add = { S: 25, A: 18, B: 10, C: 0 }[o.grade];
  const sc = s.sc + add;
  return { g: sc >= 74 ? "S" : sc >= 66 ? "A" : sc >= 54 ? "B" : "C", sc };
}

export const years = (o: string) => (o && /^\d{4}/.test(o) ? 2026 - Number(o.slice(0, 4)) : null);
export const isNew = (o: string) => Boolean(o) && o.replaceAll("-", "") >= "20260712";
export const normName = (s: string) => s.replace(/\s+|\(.*?\)|주식회사|㈜/g, "").toLowerCase();
/** ASTRO 후보의 캠퍼스 칸(10자) — 「경북대학교」→「경북대」, 분교는 뒤에 캠퍼스 표시 */
export const shortCampus = (c: Pick<CampusItem, "name" | "branch">) => (c.name.replace(/대학교$/, "대").replace(/교육대$/, "교대") + (c.branch !== "본교" ? `(${c.branch.replace("캠퍼", "캠")})` : "")).slice(0, 10);
export const kakaoSearch = (s: Pick<Store, "n" | "a">) => `https://map.kakao.com/?q=${encodeURIComponent(`${s.n} ${s.a.split(" ").slice(0, 3).join(" ")}`)}`;
export const naverSearch = (s: Pick<Store, "n" | "a">) => `https://map.naver.com/p/search/${encodeURIComponent(`${s.n} ${s.a.split(" ").slice(0, 2).join(" ")}`)}`;
