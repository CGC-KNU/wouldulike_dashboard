/**
 * 허블 매장 원장을 다른 화면에서 쓰기 (1012) — 제안서 표지 · 후보 매장명 통일.
 * 허블 매장명 = 행안부 인허가 상호 = 공식 매장명(민열님 1012).
 */
import { normName, type CampusesDoc, type Store, type StoresDoc } from "@/lib/hubble";

export const CAMPUS_SCHOOL: Record<string, string> = { 경북대: "경북대학교", 영남대: "영남대학교", 계명대: "계명대학교" };

async function doc<T>(key: string): Promise<T | null> {
  const r = await fetch(`/api/hubble/${encodeURIComponent(key)}`, { cache: "no-store" });
  if (!r.ok) return null;
  return ((await r.json()) as { data: T | null }).data;
}

let campusesCache: Promise<CampusesDoc | null> | null = null;
const storeCache = new Map<string, Promise<Store[]>>();

/** 「경북대」 → 그 본교 상권의 매장 목록(허블 c: 문서) */
export function campusStores(campus: string): Promise<Store[]> {
  const school = CAMPUS_SCHOOL[campus] ?? campus;
  if (!storeCache.has(school)) {
    campusesCache ??= doc<CampusesDoc>("campuses");
    storeCache.set(school, campusesCache.then(async (m) => {
      const c = m?.items.find((x) => x.name === school && x.branch === "본교");
      if (!c) return [];
      return (await doc<StoresDoc>(`c:${c.key}`))?.stores ?? [];
    }));
  }
  return storeCache.get(school)!;
}

/** 이름으로 찾기 — 띄어쓰기 · 괄호 무시, 앞부분 일치 먼저 */
export function searchStores(stores: Store[], q: string, limit = 20): Store[] {
  const k = normName(q);
  if (!k) return [];
  const hit = stores.filter((s) => normName(s.n).includes(k));
  hit.sort((a, b) => Number(!normName(a.n).startsWith(k)) - Number(!normName(b.n).startsWith(k)) || a.n.length - b.n.length || a.d - b.d);
  return hit.slice(0, limit);
}

// 지점 꼬리 — 「랜돌프비어 대구계명대점」 「BHC 경대북문점」. 브랜드 글자를 먹지 않게 알려진 말만 뗀다(hubble.ts matchTies 와 같은 규칙).
const TAIL = /(?:대구|경산|경북대|경대|계명대|계대|영남대|영대|대구대|북문|정문|남문|동문|서문|후문|쪽문|캠퍼스|역)+본?점$|본점$/;
const key = (n: string) => normName(n).replace(TAIL, "");

/** 후보 이름 하나에 맞는 허블 매장 — 0 · 1 · 여러 곳 */
export function matchName(stores: Store[], name: string): Store[] {
  const k = key(name);
  if (k.length < 2) return [];
  const exact = stores.filter((s) => normName(s.n) === normName(name) || key(s.n) === k);
  if (exact.length) return exact;
  if (k.length < 3) return [];
  return stores.filter((s) => { const nk = key(s.n); return normName(s.n).startsWith(k) || (nk.length >= 3 && k.startsWith(nk) && nk.length >= k.length - 1); }).slice(0, 5);
}
