/**
 * Castor · 사용자 앱(Flutter) 쪽 데이터 모양 (1008).
 *
 * 값은 전부 백엔드 문서(`/api/dashboard/admin/castor/<doc>/`)에 있다 — 이 저장소는 공개라
 * 기획 내용(지표 · 매장명 · 앱 코드 구조)을 여기 두지 않는다. 이 파일은 모양과 계산만.
 *
 * 모든 것이 **화면 ID**(home · store.detail · coupon.use …)에 매달린다.
 * Flutter 라우트 이름 = GA4 screen_name = 배너 슬롯 = 실험 대상 = 변경 카드의 대상.
 */

export type CastorDoc = "app_graph" | "screens" | "events" | "changes" | "roadmap";

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
  log?: { at: string; by: string; text: string }[];
}
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
  events: EventHealthRow[];
  screen_views: { screen: string; views: number }[];
  user_id_share: number | null; // 최근 7일 이벤트 중 user_id 가 붙은 비율(%)
  flows: Flow[];
}

/** 화면 ID 로 화면 찾기 — 없는 ID 면 null (지도가 낡았거나 사람이 잘못 적었을 때) */
export const screenById = (g: AppGraph | null, id?: string) => (g && id ? g.screens.find((s) => s.id === id) ?? null : null);
