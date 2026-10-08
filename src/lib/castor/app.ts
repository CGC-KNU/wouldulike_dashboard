/**
 * Castor · 사용자 앱(Flutter) 쪽 데이터 모양 (1008).
 *
 * 값은 전부 백엔드 문서(`/api/dashboard/admin/castor/<doc>/`)에 있다 — 이 저장소는 공개라
 * 기획 내용(지표 · 매장명 · 앱 코드 구조)을 여기 두지 않는다. 이 파일은 모양과 계산만.
 *
 * 모든 것이 **화면 ID**(home · store.detail · coupon.use …)에 매달린다.
 * Flutter 라우트 이름 = GA4 screen_name = 배너 슬롯 = 실험 대상 = 변경 카드의 대상.
 */

export type CastorDoc = "app_graph" | "screens" | "events" | "changes" | "roadmap" | "player" | "refs" | "research" | "experiments";

export interface DocEnvelope<T> {
  doc: CastorDoc;
  data: T | null;
  updated_at: string | null;
  updated_by: string | null;
}

/* ── 앱 지도 — CGC/04_사내툴_개발/04_castor/castor_app_parse.py 가 앱 코드에서 뽑는다 ── */
export type Lane = "entry" | "browse" | "store" | "process" | "wallet" | "etc";
export const LANE_LABEL: Record<Lane, string> = { entry: "진입", browse: "탐색", store: "매장", process: "처리", wallet: "지갑", etc: "기타" };
export const LANES: Lane[] = ["entry", "browse", "store", "process", "wallet", "etc"];

export interface AppScreen { id: string; name: string; lane: Lane; cls: string | null; file: string; line: number; events: string[] }
export interface AppEdge { from: string; to: string; kind: "push" | "popup" | "tab"; calls: number; at: string[] }
export interface AppEvent { name: string; const: string; used: string[]; screens: string[] }
export interface AppGraph {
  generated_at: string;
  source: { repo: string; commit: string };
  lanes: Lane[];
  screens: AppScreen[];
  edges: AppEdge[];
  unresolved: { from: string; file: string; line: number; call: string }[];
  events: AppEvent[];
  deeplinks: string[];
  named_routes: string[];
  user_id_set: boolean;
}

/* ── 화면 덧붙임 — 사람이 적는 것(캡처 · 문제 · 메모) ── */
export interface ScreenNote { capture_url?: string; issue?: string; note?: string }
export type ScreenNotes = Record<string, ScreenNote>;

/* ── 계측 정의서 — 앱 이벤트 목록(지도) 위에 사람이 붙이는 상태 · 담당 · 메모, 그리고 아직 없는 이벤트 ── */
export type EventPlan = "keep" | "fix" | "add" | "drop";
export const EVENT_PLAN_LABEL: Record<EventPlan, string> = { keep: "유지", fix: "고칠 것", add: "새로 추가", drop: "안 씀" };
export interface EventRow {
  name: string;
  plan: EventPlan;
  screen?: string;
  owner?: string;
  why?: string;
  params?: string;
  task?: string; // 기획안 과제 번호
}
export interface EventsDoc { rows: EventRow[] }

/* ── 변경 보드 ── */
export type ChangeStatus = "proposed" | "design" | "dev" | "shipped" | "measuring" | "done";
export const CHANGE_STATUS: { key: ChangeStatus; label: string }[] = [
  { key: "proposed", label: "제안" }, { key: "design", label: "디자인" }, { key: "dev", label: "개발" },
  { key: "shipped", label: "배포" }, { key: "measuring", label: "측정 중" }, { key: "done", label: "결론" },
];
export type ChangeKind = "screen" | "copy" | "setting" | "bug" | "ops" | "measure";
export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = { screen: "화면", copy: "문구", setting: "설정 · 기본값", bug: "버그", ops: "운영", measure: "계측" };
export type ChangePath = "remote" | "dev" | "ops" | "us";
export const CHANGE_PATH_LABEL: Record<ChangePath, string> = { remote: "바로 적용(원격 설정)", dev: "개발(재민)", ops: "운영(현장)", us: "세틀라이트 · 우리" };
export interface ChangeCard {
  id: string;
  title: string;
  screen?: string;
  kind: ChangeKind;
  path: ChangePath;
  status: ChangeStatus;
  stage?: 1 | 2 | 3;
  task?: string;
  owner?: string;
  now?: string;
  next?: string;
  measure?: string;
  note?: string;
  handed_off_at?: string;
  // 변경 보드 v2 — 어떻게 잴까 · 체크리스트 · 바로 적용 키
  method?: "before_after" | "ab" | "holdout" | "store" | "none";
  metric?: string;
  period?: string;
  guard?: string;
  rc_key?: string;
  checks?: { text: string; done: boolean }[];
  log?: { at: string; by: string; text: string }[];
}
export const METHOD_LABEL: Record<NonNullable<ChangeCard["method"]>, string> = { before_after: "전후 비교", ab: "A/B", holdout: "홀드아웃", store: "매장 단위", none: "재지 않음" };

/* ── 눌러보기(플레이어) — 기획안 시안 castor_mocks3.NOW · AFTER 그대로 ── */
export type HotStatus = "ok" | "miss" | "none" | "dead" | "new";
export interface PlayerDoc {
  now: Record<string, { title: string; img: string; screen: string; view: [string, HotStatus]; hs: [number, number, number, number, string, string, HotStatus, string][] }>;
  after: Record<string, { title: string; sid: string; hs: [string, string, string, HotStatus, string][] }>;
  after_html: Record<string, string>;
  after_css: string;
  thumbs: Record<string, string>;
  source: string;
}

/* ── 레퍼런스 · 조사 ── */
export interface RefItem { id: string; app: string; dev?: string; store_url?: string; category: string; shots: string[]; take: string; screen: string }
export interface RefsDoc { items: RefItem[] }
export interface ResearchReq { id: string; scope: "화면" | "흐름" | "실험"; screen?: string; status: "queued" | "doing" | "done"; by: string; at?: string; question: string; range?: string; answer?: string; refs?: string[]; card?: string }
export interface ResearchDoc { requests: ResearchReq[] }

/* ── 실험 v2 (마법사) ── */
export type ExpMethod = "ab" | "before_after" | "holdout" | "store";
export type ExpState = "draft" | "review" | "check" | "running" | "judged" | "logged";
export const EXP_LIFE: { key: ExpState; label: string }[] = [
  { key: "draft", label: "초안" }, { key: "review", label: "검토" }, { key: "check", label: "출시 점검" },
  { key: "running", label: "진행" }, { key: "judged", label: "판정" }, { key: "logged", label: "기록" },
];
export interface Experiment {
  id: string; title: string; screen?: string; change?: string; hypothesis: string;
  metric: { name: string; event?: string; base?: number; mde?: number }; method: ExpMethod;
  guard?: string; stop_rule?: string; days: number; start?: string; state: ExpState;
  checks: { text: string; done: boolean }[]; log: { at: string; by: string; text: string }[];
}
export interface ExperimentsDoc { items: Experiment[] }
export interface ChangesDoc { cards: ChangeCard[] }

/* ── 단계(0~2) 체크리스트 — 기획안 Castor 절 C6 로드맵 ── */
export type ItemState = "todo" | "doing" | "done" | "blocked";
export const ITEM_STATE_LABEL: Record<ItemState, string> = { todo: "할 일", doing: "진행 중", done: "완료", blocked: "막힘" };
export interface RoadmapItem { id: string; stage: 0 | 1 | 2; title: string; owner: "us" | "jaemin" | "both"; state: ItemState; note?: string }
export interface RoadmapDoc { items: RoadmapItem[] }
export const OWNER_LABEL: Record<RoadmapItem["owner"], string> = { us: "민열 · Claude", jaemin: "재민", both: "함께" };

/* ── BigQuery 로 읽는 것 ── */
export interface EventHealthRow { name: string; d7: number; last_day: number; devices7: number }
export interface FlowStep { event: string; label: string; devices: number }
export interface Flow { key: string; title: string; steps: FlowStep[] }
export interface CastorHealth {
  ok: boolean;
  reason?: string;
  through: string | null; // 마지막 확정 테이블 날짜 YYYY-MM-DD
  window: { from: string; to: string } | null;
  days: number;
  events: EventHealthRow[];
  fail_reasons: { reason: string; n: number }[];
  redeem_lag: { d: number; n: number }[]; // 0..7(7=7일 이상)
  weekly: { wk: string; opened: number; redeemed: number }[];
  screen_views: { screen: string; views: number }[];
  user_id_share: number | null; // 최근 7일 이벤트 중 user_id 가 붙은 비율(%)
  flows: Flow[];
}

/** 화면 ID 로 화면 찾기 — 없는 ID 면 null (지도가 낡았거나 사람이 잘못 적었을 때) */
export const screenById = (g: AppGraph | null, id?: string) => (g && id ? g.screens.find((s) => s.id === id) ?? null : null);
