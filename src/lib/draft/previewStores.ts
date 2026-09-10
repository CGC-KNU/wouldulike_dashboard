/**
 * 미리보기용 매장 스냅샷 — **`ASTRO_PREVIEW=1` 일 때만** 쓴다.
 *
 * 백엔드 계정 없이 화면을 돌려보려면 매장 목록이 필요하다. 그렇다고 매장을 지어내면
 * 화면을 보는 사람이 그걸 실데이터로 오해한다. 그래서 여기 들어간 34곳은
 * **2026-09-10 운영 대시보드에서 실제로 읽은 목록 그대로**다 — id·상호·플랜까지.
 *
 * 지표(쿠폰·스탬프·단골)는 넣지 않는다. 그건 매장마다 다르고 지어낼 수 없다.
 * 미리보기에서는 전부 '모름'으로 표시된다.
 *
 * 백엔드가 붙으면 이 파일은 절대 쓰이지 않는다. 정리할 때 통째로 지우면 된다.
 */

export interface PreviewRestaurant {
  restaurant_id: number;
  name: string;
  tier: string | null;
  is_affiliate: boolean;
}

export const PREVIEW_SNAPSHOT_DATE = "2026-09-10";

export function previewRestaurants(): PreviewRestaurant[] {
  const rows: [number, string, string | null][] = [
    [30, "고니식탁", null],
    [249, "고씨네 대구경북대본점", null],
    [33, "구구포차", "BOOST"],
    [256, "기프트버거 경대점", "BOOST"],
    [285, "난탄 경대북문점", "BOOST"],
    [297, "남해암소한마당 경대북문점", "FREE"],
    [305, "다원국밥", "FREE"],
    [56, "다이와스시", "BOOST"],
    [146, "닭동가리 경북대점", "BOOST"],
    [47, "대부 대왕유부초밥 경대점", null],
    [318, "돈타코", "FREE"],
    [317, "라라더", "BOOST"],
    [62, "마름모식당", null],
    [41, "부리또익스프레스", "FREE"],
    [266, "북성로 우동 불고기", "BOOST"],
    [271, "사랑과평화경북대점", null],
    [268, "수리다비다 언더월드", null],
    [298, "슈퍼크리스피 경북대점", null],
    [143, "스톡홀름샐러드 정문점", "BOOST"],
    [319, "쌈마이닭쌈밥", null],
    [250, "온새미로", null],
    [316, "웃찌커피", "FREE"],
    [97, "정든밤", "BOOST"],
    [212, "정직유부 경북대점", "FREE"],
    [144, "주비두루 향기롭다", null],
    [322, "진갈매기", "BOOST"],
    [145, "통통주먹구이 경북대점", "BOOST"],
    [147, "포차1번지먹새통 경북대점", null],
    [209, "하카타 파스타", null],
    [74, "한끼갈비", null],
    [233, "핵밥 경북대점", "BOOST"],
    [321, "행컵 경대점", null],
    [245, "혜화문식당", "BOOST"],
    [320, "BHC 경대북문점", null],
  ];
  return rows.map(([restaurant_id, name, tier]) => ({
    restaurant_id,
    name,
    tier,
    is_affiliate: true,
  }));
}

/**
 * 미리보기 모드인가.
 * 배포 대상은 Vercel 뿐이므로 `VERCEL` 환경변수가 있으면 플래그가 켜져 있어도 무조건 꺼진다 —
 * 운영에 실수로 `ASTRO_PREVIEW=1` 이 들어가도 더미 관리자가 생기지 않는다.
 * (NODE_ENV 로 막으면 로컬 `next start` 스크린샷 검증도 같이 막혀서 VERCEL 로 잡았다.)
 */
export function isPreview(): boolean {
  return process.env.ASTRO_PREVIEW === "1" && !process.env.VERCEL;
}
