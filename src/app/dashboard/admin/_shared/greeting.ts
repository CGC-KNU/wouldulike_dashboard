/**
 * 환영 인사 — 들어올 때마다 조금씩 다른 말.
 *
 * 한 문장이 고정돼 있으면 며칠 만에 글자가 아니라 배경이 된다 (민열님 0919).
 * 시간대로 먼저 갈리고, 그 안에서 날짜·시각으로 고른다 — **같은 시간에 새로고침하면
 * 같은 말**이 나온다. 무작위로 매번 바꾸면 화면이 산만하고, 서버와 클라이언트가
 * 다른 말을 그려 깜빡인다.
 *
 * 상황이 분명할 때는 그 말이 시간대를 이긴다 — 월요일 아침에 "좋은 아침"보다
 * "한 주가 시작됐어요"가 더 많은 걸 말한다.
 */

const DAWN = [
  "아직 이른 시간이에요",
  "새벽까지 고생이 많아요",
  "조용한 시간이네요",
];

const MORNING = [
  "좋은 아침이에요",
  "오늘도 시작이네요",
  "상쾌한 아침이에요",
  "아침이 밝았어요",
];

const NOON = [
  "점심은 드셨나요",
  "한낮이네요",
  "오후로 넘어가는 참이에요",
];

const AFTERNOON = [
  "좋은 오후예요",
  "오후도 힘내요",
  "한창인 시간이네요",
  "오늘 절반을 넘었어요",
];

const EVENING = [
  "수고 많았어요",
  "하루가 저물어가요",
  "저녁이에요",
  "오늘도 고생했어요",
];

const NIGHT = [
  "늦은 시간이네요",
  "오늘은 여기까지 어때요",
  "밤이 깊었어요",
];

/** 요일·시간이 겹쳐 뜻이 분명해지는 순간. 시간대 인사보다 먼저 쓴다. */
const MONDAY_MORNING = ["한 주가 시작됐어요", "새 한 주예요"];
const FRIDAY_EVENING = ["한 주 마무리네요", "금요일 저녁이에요"];
const WEEKEND = ["주말인데 나오셨네요", "주말이에요"];

/** 날짜와 시간대로 고르는 값. 같은 시간대에 새로고침하면 같은 말이 나온다. */
function pick(list: string[], seed: number): string {
  return list[seed % list.length];
}

export function greetingFor(now: Date = new Date()): string {
  const h = now.getHours();
  const day = now.getDay(); // 0=일
  // 씨앗 — 날짜가 바뀌거나 시간대가 넘어가야 말이 바뀐다
  const seed = now.getFullYear() * 1000 + Math.floor(now.getMonth() * 31 + now.getDate()) + h;

  if ((day === 6 || day === 0) && h >= 8 && h < 22) return pick(WEEKEND, seed);
  if (day === 1 && h >= 5 && h < 11) return pick(MONDAY_MORNING, seed);
  if (day === 5 && h >= 17 && h < 23) return pick(FRIDAY_EVENING, seed);

  if (h < 5) return pick(DAWN, seed);
  if (h < 11) return pick(MORNING, seed);
  if (h < 14) return pick(NOON, seed);
  if (h < 18) return pick(AFTERNOON, seed);
  if (h < 22) return pick(EVENING, seed);
  return pick(NIGHT, seed);
}

/**
 * 부르는 말 — 이름 뒤에 붙는 것.
 *
 * 두 공동대표만 "노대표님 · 양대표님" 으로 부른다 (민열님 0919). 나머지는 이름 + 님.
 * 성(姓)은 계정에 없어서 username 으로 가른다 — 표시 이름은 바뀔 수 있지만 계정 ID 는 안 바뀐다.
 * 그래서 화면에 나오는 건 "노대표님" 처럼 성+직위 한 덩어리이고, 이름은 그 뒤에 숨는다.
 */
const HONORIFIC: Record<string, string> = {
  jaemin: "노대표님",
  minyeol: "양대표님",
};

/** { name: 화면에 굵게 나올 말, suffix: 그 뒤 } — 일반 팀원은 { "민찬", "님" }, 대표는 { "노대표님", "" } */
export function addressee(username: string, displayName: string): { name: string; suffix: string } {
  const h = HONORIFIC[username];
  return h ? { name: h, suffix: "" } : { name: displayName, suffix: "님" };
}
