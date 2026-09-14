/**
 * 파트너 적합도 (베타) — 영남대 37곳에서 **역산한** 공식이다 (0914).
 *
 * 새로 만든 규칙이 아니다. 시트 '신규 식당 컨택_영남대' 에 사람이 이미 매겨 둔
 * 규모·여지·점수·등급이 있었고, 그 계산을 복원했다. 되돌려 검산하니 등급이 **37곳 중 35곳** 맞았다
 * (자야·가안 두 곳만 B/C 경계에서 갈렸다).
 *
 *   점수 = 0.75 × 규모 + 0.25 × 여지
 *   등급 = A ≥ 76 · B 53~75 · C ≤ 52
 *
 * ## 두 축이 다른 것을 잰다
 *
 * **규모**는 "이 집이 얼마나 큰가", **여지**는 "우리가 끼어들 자리가 있나".
 * 그래서 이미 잘하는 집(초원댁: 규모 94·여지 30 → 78)보다
 * 큰데 인스타가 없는 집(장군제육: 규모 75·여지 100 → 81)이 위로 온다.
 * 윤지님 선정 기준(9문항)이 노리던 판단이 이것이다.
 *
 * ## 왜 (베타) 인가
 *
 * 영남대 한 상권에서만 뽑은 자다. 다른 상권에서도 맞는지는 아직 모른다.
 * 어긋나는 게 보이면 고친다 — 그러라고 화면에 근거를 같이 적는다.
 */

export type InstaState = "NONE" | "DORMANT" | "PRIVATE" | "OWNER" | "IDLE" | "WEAK" | "ACTIVE";

/** 인스타 상태 → 여지. 시트에서 쓰던 값 그대로. */
export const INSTA_STATES: { key: InstaState; label: string; room: number; why: string }[] = [
  { key: "NONE",    label: "계정 없음",        room: 100, why: "인스타가 아예 없습니다 — 우리가 처음 만들어 줍니다" },
  { key: "DORMANT", label: "휴면",            room: 85,  why: "만들어 두고 오래 안 올립니다" },
  { key: "PRIVATE", label: "비공개·개인계정",  room: 75,  why: "장사용 계정이 아닙니다" },
  { key: "OWNER",   label: "사장님·본사 계정", room: 70,  why: "매장 계정이 따로 없습니다" },
  { key: "IDLE",    label: "개설만·저활동",    room: 65,  why: "계정은 있는데 거의 안 씁니다" },
  { key: "WEAK",    label: "운영 중·도달 부족", room: 55,  why: "올리는데 조회수가 안 나옵니다" },
  { key: "ACTIVE",  label: "운영 중",          room: 30,  why: "이미 잘 돌리고 있어 우리가 보탤 게 적습니다" },
];
const ROOM: Record<InstaState, number> = Object.fromEntries(INSTA_STATES.map((s) => [s.key, s.room])) as Record<InstaState, number>;

/**
 * 규모의 자 — 영남대 37곳의 합성값 분포(2026-09).
 *
 * 원본은 **그 37곳 안에서의 백분위**였다. 그런데 백분위를 매번 다시 계산하면
 * 매장이 늘 때마다 기존 매장 등급이 저절로 바뀐다. 어제 A였던 집이 오늘 B가 되는
 * 점수는 아무도 안 믿는다. 그래서 그때의 분포를 **자로 박아** 둔다.
 */
const CURVE = [0.4494,0.4711,0.5163,0.5266,0.5333,0.5478,0.5541,0.5618,0.5788,0.5895,0.5985,0.6135,0.6157,0.6292,0.6355,0.6435,0.6453,0.6792,0.6935,0.6952,0.7041,0.7112,0.7188,0.726,0.7291,0.7362,0.7441,0.7454,0.7501,0.7552,0.7726,0.7942,0.8406,0.8489,0.8758,0.9519,0.9564];

/** 리뷰 4,681 과 93 을 선형으로 재면 아래쪽이 전부 0 으로 눌린다 — 그래서 로그다. */
const CAP = { reviews: 5000, blogs: 500, followers: 20000 };
const W = { reviews: 0.75, blogs: 0.2, followers: 0.05 };
const lg = (v: number, cap: number) => Math.log10(Math.min(Math.max(v, 0), cap) + 1) / Math.log10(cap + 1);

export interface FitInput {
  reviews?: number | null;   // 네이버 방문자리뷰
  blogs?: number | null;     // 네이버 블로그리뷰
  followers?: number | null; // 인스타 팔로워
  insta_state?: InstaState | null;
}
export interface Fit {
  size: number | null;
  room: number | null;
  score: number | null;
  grade: "A" | "B" | "C" | null;
  angle: string;
}

/** 안 잰 것과 0 은 다르다 — 셋 다 비면 규모를 매기지 않는다. */
function sizeOf(x: FitInput): number | null {
  if (x.reviews == null && x.blogs == null && x.followers == null) return null;
  const v = W.reviews * lg(x.reviews ?? 0, CAP.reviews) + W.blogs * lg(x.blogs ?? 0, CAP.blogs) + W.followers * lg(x.followers ?? 0, CAP.followers);
  const n = CURVE.length;
  if (v <= CURVE[0]) return 0;
  if (v >= CURVE[n - 1]) return 100;
  let i = 0;
  while (i < n - 1 && CURVE[i + 1] < v) i += 1;
  const t = (v - CURVE[i]) / (CURVE[i + 1] - CURVE[i]);
  return Math.round(((i + t) / (n - 1)) * 100);
}

/** 공략 포인트 한 줄 — 미팅에 들고 갈 말. 규칙이 쓰고 사람이 고친다. */
function angleOf(x: FitInput, size: number | null): string {
  const out: string[] = [];
  const s = INSTA_STATES.find((v) => v.key === x.insta_state);
  if (s) out.push(s.key === "NONE" ? "인스타가 없다" : s.key === "DORMANT" ? "인스타가 잠들어 있다"
    : s.key === "WEAK" ? "올리는데 도달이 안 나온다" : s.key === "OWNER" ? "매장 계정이 따로 없다"
    : s.key === "ACTIVE" ? "이미 잘 돌린다 — 보탤 게 적다" : s.label);
  if ((x.reviews ?? 0) >= 700) out.push(`손님은 많이 온다(리뷰 ${(x.reviews ?? 0).toLocaleString()})`);
  else if (x.reviews != null && x.reviews < 300) out.push("아직 작은 집");
  if ((x.blogs ?? 0) >= 250) out.push("블로그는 도는 중");
  if (!out.length && size == null) return "";
  return out.join(" · ");
}

export function fitOf(x: FitInput): Fit {
  const size = sizeOf(x);
  const room = x.insta_state ? ROOM[x.insta_state] : null;
  const angle = angleOf(x, size);
  if (size == null || room == null) return { size, room, score: null, grade: null, angle };
  const score = Math.round(0.75 * size + 0.25 * room);
  return { size, room, score, grade: score >= 76 ? "A" : score >= 53 ? "B" : "C", angle };
}
