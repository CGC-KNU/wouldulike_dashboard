/**
 * Atlas — ABOUT WOULDULIKE 의 내용 (팀 내부용, 민열님 0919 승인).
 *
 * 화면이 아니라 **내용**이 여기 있다. 조직·미션·연혁은 코드가 아니라 사실이라, 바뀌면 이 파일만 고친다.
 * 출처를 같이 적는다 — 이 숫자가 어디서 왔는지 모르면 다음 사람이 못 고친다.
 *
 * 직함 약자는 백엔드 dashboard/models.py 의 DEFAULT_TITLES 와 같은 표다. 둘이 어긋나면 그쪽이 원본이다.
 * 슬랙 ID 는 워크스페이스 users.list 실측(0918).
 */

export interface Person {
  name: string;
  /** 약자 — PO·CEO 같은 대외 직함 */
  title: string;
  /** 풀네임 직함 */
  role: string;
  /** 슬랙 멤버 ID — "누구한테 물어보지"에서 바로 DM 으로 */
  slack?: string;
  /** 계정 username (있으면). 관리자 설정의 계정과 잇는 열쇠 */
  username?: string;
  /** 한 줄 책임 */
  duty?: string;
}

export interface Group {
  key: string;
  name: string;
  kr: string;
  line: string;
  people: Person[];
  /** 공석 */
  open?: { role: string; note: string };
}

/** 두 공동대표 — 그룹 위에 따로 선다. */
export const FOUNDERS: Person[] = [
  { name: "양민열", title: "PO·CEO", role: "Product Owner · 창립자", slack: "U07JKRLAQGG", username: "minyeol", duty: "전략 · 비즈니스 모델 · 재무 · 법무/세무 리스크" },
  { name: "노재민", title: "TL·CTO", role: "Tech Lead · 공동창립자", slack: "U07JM4X70AC", username: "jaemin", duty: "개발 총괄 · 백엔드 아키텍처 · 개발 전략" },
];

/** 4개 기능 그룹 — "직급이 아니라 기능으로 나눴다" (팀모델 0807). 그룹마다 Lead → 중간 → 주니어. */
export const GROUPS: Group[] = [
  {
    key: "pe", name: "Product & Engineering", kr: "제품·개발", line: "앱 · 매장 콘솔 자체 개발",
    people: [{ name: "노재민", title: "TL·CTO", role: "Tech Lead", slack: "U07JM4X70AC", username: "jaemin" }],
    open: { role: "Visual Engineer", note: "모집 9/14~25 · 면접 9/26~27 (Creative Lead 에서 개발 직군으로 재정의)" },
  },
  {
    key: "gm", name: "Growth & Marketing", kr: "성장·마케팅", line: "기획 · 편집 · 디자인을 한 팀 안에서",
    people: [
      { name: "정아윤", title: "ML", role: "Marketing Lead", slack: "U0BPR7VBS7K", username: "ayun" },
      { name: "김채린", title: "CP", role: "Content Producer", slack: "U0BQHND1T9N" },
      { name: "황서연", title: "CD", role: "Content Designer", slack: "U0BR0884DTM" },
      { name: "전희진", title: "CE", role: "Content Editor", slack: "U0BR086QBC3" },
    ],
  },
  {
    key: "sp", name: "Sales & Partnership", kr: "영업·제휴", line: "상권 발굴 · 신규 계약 · 관계 관리",
    people: [
      { name: "주준영", title: "SL", role: "Sales Lead", slack: "U0BP7TXJXP1", username: "junyoung" },
      { name: "신정환", title: "PM", role: "Partnership Manager", slack: "U0BPH2J6F27", username: "junghwan" },
      { name: "정윤지", title: "AE", role: "Account Executive", slack: "U0BQHKQ154G", username: "yunji" },
      { name: "유민희", title: "SA", role: "Sales Associate", slack: "U0BR8DTTK0R" },
      { name: "김수연", title: "FS", role: "Frontier Scout", slack: "U0BUHJFFCHW" },
    ],
  },
  {
    key: "do", name: "Data & Operations", kr: "데이터·운영·전략", line: "성과 계측 · 월간 리포트 · 전략 분석",
    people: [
      { name: "안민찬", title: "DA", role: "Data Analyst", slack: "U0BPR7SUHJ5", username: "minchan" },
      { name: "이서지", title: "SA", role: "Strategy Associate", slack: "U0BTK413Q3F" },
    ],
  },
];

/**
 * 지금 몇 명인가. **아래 명단에서 센다** — 손으로 적어 두면 어긋난다 (0925).
 *
 * 0919 에 14 로 박아 뒀는데 명단에는 13명이 나왔다. 노재민이 FOUNDERS 와 GROUPS 양쪽에
 * 들어 있어 화면에는 14줄이 그려지지만 실제 사람은 13명이다. 새로 온 사람이 조직도에서
 * 머릿수를 세면 하나가 빈다. Visual Engineer 는 충원 예정이라 여기 안 들어간다.
 */
export const HEADCOUNT = countPeople();

/** 이름으로 센다 — 노재민처럼 두 자리에 들어간 사람이 두 번 세어지지 않게. */
function countPeople(): number {
  const names = new Set<string>();
  for (const p of FOUNDERS) names.add(p.name);
  for (const g of GROUPS) for (const p of g.people) names.add(p.name);
  return names.size;
}

/** 미션 — 팀모델 0807 정식 미션문. 랜딩·링크드인의 3단(발견·증명·확장)과 같은 논리. */
export const MISSION = {
  headline: "대학 상권의 로컬 F&B가 발견되고 다시 찾게 되는 인프라가 된다",
  oneLiner: "학생은 혜택을, 가게는 손님을.",
  steps: [
    { k: "발견", body: "광고비를 쓸 여력이 없는 개인 매장이 학생에게 닿는 기본 경로가 됩니다. 매장이 스스로 만들 수 없는 도달과 콘텐츠를 상권 단위로 공급합니다." },
    { k: "증명", body: "매장의 마케팅을 대신하는 데서 멈추지 않습니다. 콘텐츠를 본 사람이 실제로 방문했는지를 계산대에서 세고, 그 인과를 매달 숫자로 돌려줍니다." },
    { k: "확장", body: "그렇게 쌓인 데이터 위에서 매장 하나가 아니라 상권 단위로 확장합니다. 한 상권에서 검증된 공식을 다음 상권으로 복제하는 것이 성장의 기본 단위입니다." },
  ],
  /** 커피챗 소개서 0907 — 신규 멤버에게 "우리가 뭘 모르는지"를 먼저 보여 주는 게 온보딩이다. */
  unsolved: [
    { k: "앱이 매일 여는 물건이 아니다", body: "DAU/WAU 19.4%. 20%를 넘어야 습관이라고 부를 수 있다." },
    { k: "쿠폰 사용 구간의 공백", body: "발급은 세는데 사용은 매장 계산대에서 끊긴다. Probe 가 붙일 자리." },
    { k: "귀속 방문을 아직 못 센다", body: "\"콘텐츠를 보고 왔다\"를 숫자로 만드는 인과 카운터가 Gate A 의 핵심." },
  ],
};

/** Polaris — 향하는 곳. 게이트는 목표가 아니라 제동 장치다 (팀모델 06장). */
export const POLARIS = {
  phases: [
    { key: "P1", name: "증명", where: "경북대", body: "한 상권에서 방문이 늘었다는 인과를 데이터로 보입니다." },
    { key: "P2", name: "길목", where: "영남대 · 계명대", body: "개업, 예약, 리워드처럼 점주가 매일 여는 도구를 잡습니다." },
    { key: "P3", name: "확장", where: "다른 상권", body: "만들어진 운영 표준을 다른 상권에 깔고 나눕니다." },
  ],
  gates: {
    A: ["유료 매장 30곳+", "만기 재계약률 60%+", "월 이탈 5%↓", "10개 매장 귀속 방문 3%+", "매장 CAC < 3개월 총수익"],
    B: ["2개 상권 재현", "유료 100곳", "법인 전환 + 3인 정규 급여화", "데이터 제공 동의 30곳", "선입금 LOI 5건"],
    C: ["1호점 12개월 흑자", "ROIC 15%+", "P2 연매출 5억+·이익률 20%+ 또는 외부 자본 10억+"],
  },
};

export const FACTS: { k: string; v: string; note?: string }[] = [
  { k: "브랜드", v: "우주라이크 · WOULDULIKE · @w_ouldulike" },
  { k: "설립", v: "2024년 6월 팀 결성 · 2025년 11월 사업자 개업", note: "대구 북구 · 민열님 정본 0919" },
  { k: "공동대표", v: "양민열 · 노재민" },
  { k: "형태", v: "개인사업자 (코끼리) · 법인 전환 2028.5 예정" },
  { k: "자본", v: "외부 조달 없음 · 자체 매출 운영" },
  { k: "주소", v: "대구광역시 북구 대학로80, 글로벌플라자 101호" },
  { k: "문의", v: "hello@wouldulike.kr" },
];

export const TIMELINE: { when: string; what: string; planned?: boolean }[] = [
  { when: "2024.06", what: "팀 결성" },
  { when: "2025.11", what: "사업자 개업 (코끼리, 11/26)" },
  { when: "2026 상반기", what: "맛집 매거진 개설 · 학생회 채널 배포망 · 앱 및 매장 콘솔 자체 개발" },
  { when: "2026.07", what: "파트너 식당 29곳 · 표준계약서 정비 · 첫 구독 매출" },
  { when: "2026.08.30", what: "14인 체계 확정 · 접촉 54 / 계약 21" },
  { when: "2026.09", what: "26-2 월납 구독 개시 · wouldulike.kr 개통 · Satellite 실가동 · Visual Engineer 모집" },
  { when: "2027.01–02", what: "Gate A 판정 · 초기창업패키지 신청", planned: true },
  { when: "2028.05", what: "법인 전환 (Gate B)", planned: true },
];

export const LINKS = {
  site: "https://wouldulike.kr",
  instagram: "https://www.instagram.com/w_ouldulike/",
  garage: "https://slack.com/app_redirect?channel=C0BUFD89S3S",
};
