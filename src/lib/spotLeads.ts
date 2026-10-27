/**
 * 스팟 제작 · 컨택 후보 (1028 민열님) — 허블 매장 중 인스타에 광고 흔적이 있는 곳.
 *
 * 이미 협찬 · 체험단에 돈을 쓰거나 이벤트를 하는 매장이 스팟 제작을 살 가능성이 가장 높다.
 * 따로 저장하지 않는다 — 탭이 열릴 때마다 허블 상권 문서(c:<key>)에서 새로 뽑는다(허블 주간 갱신이 곧 후보 갱신).
 * 이미 스팟 건이 있는 매장은 뺀다. 파트너 여부는 허블 화면과 같은 이름 대조(matchTies)로 붙인다.
 */
import { igEvent, igSponsor, matchTies, normName, sigCompare, type PartnerRow, type Store } from "./hubble";

/** 인스타 광고 흔적을 모으는 상권 — 백엔드 scripts/hubble/ig_enrich.py 의 DEFAULT(IG_CAMPUSES)와 같아야 한다 */
export const SPOT_LEAD_CAMPUSES = [
  { key: "53a3df1eef", name: "경북대" },
  { key: "03d4df4e32", name: "계명대" },
  { key: "72939bed75", name: "영남대" },
] as const;

/** 협찬 흔적이 이 날수 안이면 「최근」 — 최근에 돈을 쓴 곳을 위로 */
export const RECENT_SPONSOR_DAYS = 90;

export interface SpotLead {
  campus: string;
  store: Store;
  /** 파트너 매장으로 이어지면 그 restaurant_id */
  rid: number | null;
}

/** 이미 있는 스팟 건 — 이름 · 메모(「인허가 <id>」)만 본다 */
export interface SpotLike { name: string; memo?: string | null; restaurant_id?: number | null }

const day = (s: string | null | undefined) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? Date.parse(s.slice(0, 10)) : NaN);

/** 0 = 최근 협찬, 1 = 오래됐거나 날짜 모르는 협찬, 2 = 이벤트만 */
function tier(s: Store, now: number): number {
  if (!igSponsor(s)) return 2;
  const t = day(s.ig?.sig?.sponsor_last);
  return !Number.isNaN(t) && now - t <= RECENT_SPONSOR_DAYS * 864e5 ? 0 : 1;
}

/** 순서 — 최근 협찬 → 협찬 → 이벤트만. 같은 칸 안에서는 광고 흔적순(sigCompare), 그다음 최근 협찬일 · 이벤트 수 */
export function leadCompare(now: number) {
  return (a: Store, b: Store) =>
    tier(a, now) - tier(b, now) ||
    sigCompare(a, b) ||
    (day(b.ig?.sig?.sponsor_last) || 0) - (day(a.ig?.sig?.sponsor_last) || 0) ||
    (b.ig?.sig?.event ?? 0) - (a.ig?.sig?.event ?? 0);
}

/** 스팟 건 이름과 같은 매장인가 — 공백 · 괄호 · 지점 꼬리 정도만 무시하고 앞머리로 맞춘다 */
function sameName(store: string, spot: string) {
  const a = normName(store), b = normName(spot);
  if (a.length < 2 || b.length < 2) return false;
  return a === b || (b.length >= 3 && a.startsWith(b)) || (a.length >= 3 && b.startsWith(a));
}

/**
 * 컨택 후보 고르기 — 광고 흔적(협찬 > 0 또는 이벤트 > 0)이 있고, 아직 스팟 건이 없는 매장.
 * docs 는 상권별 매장 목록, partners 는 ASTRO 매장 목록(파트너 표시용), spots 는 지금 있는 스팟 건(단계 무관 — 거절도 뺀다).
 */
export function pickSpotLeads(
  docs: { campus: string; stores: Store[] }[],
  partners: PartnerRow[],
  spots: SpotLike[],
  { limit = 20, now = Date.now() }: { limit?: number; now?: number } = {},
): SpotLead[] {
  const ids = new Set(spots.map((s) => s.memo?.match(/인허가 (\S+)/)?.[1]).filter(Boolean) as string[]);
  const rids = new Set(spots.map((s) => s.restaurant_id).filter((x): x is number => typeof x === "number"));
  const out: SpotLead[] = [];
  for (const d of docs) {
    const ties = matchTies(d.stores, partners, [], d.campus);
    for (const s of d.stores) {
      if (!igSponsor(s) && !igEvent(s)) continue;
      const t = ties[s.id];
      const rid = t?.kind === "partner" ? t.rid : null;
      if (ids.has(s.id) || (rid !== null && rids.has(rid)) || spots.some((x) => sameName(s.n, x.name))) continue;
      out.push({ campus: d.campus, store: s, rid });
    }
  }
  const cmp = leadCompare(now);
  return out.sort((a, b) => cmp(a.store, b.store)).slice(0, limit);
}

/** 광고 흔적 한 줄(목록용, 짧게) */
export function leadSignal(s: Store): string {
  const g = s.ig?.sig;
  if (!g) return "";
  const parts: string[] = [];
  if ((g.sponsor ?? 0) > 0) {
    const last = day(g.sponsor_last);
    parts.push(`협찬 · 체험단 ${g.sponsor}편${Number.isNaN(last) ? "" : ` (최근 ${Number(g.sponsor_last!.slice(5, 7))}/${Number(g.sponsor_last!.slice(8, 10))})`}`);
  }
  if ((g.event ?? 0) > 0) parts.push(`이벤트 ${g.event}편`);
  return parts.join(" · ");
}
