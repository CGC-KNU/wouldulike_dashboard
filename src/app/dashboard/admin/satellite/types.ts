export type Department = "SUPERADMIN" | "ADMIN" | "MARKETING" | "SALES";
export type SatelliteRole = "LEAD" | "MEMBER";

export type PlanStatus =
  | "draft"
  | "ready"
  | "locked"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export type MediaType = "carousel" | "reel" | "image";

export interface SatelliteMember {
  id: number;
  username: string;
  display_name: string;
  department: Department;
  department_label: string;
  satellite_role: SatelliteRole;
  weekly_quota: number;
  is_active: boolean;
}

export interface ContentPlan {
  id: number;
  owner_id: number;
  owner_name: string;
  owner_active: boolean;
  scheduled_date: string; // YYYY-MM-DD
  topic: string;
  media_type: MediaType;
  status: PlanStatus;
  card_count: number;
  hashtag_count: number;
  ready_at: string | null;
  created_at: string;
}

export interface PlansResponse {
  year: number;
  month: number;
  today: string;
  plans: ContentPlan[];
  viewer: {
    account_id: number | null;
    is_lead: boolean;
    department: Department;
  };
}

export interface MyWeek {
  has_account: boolean;
  week_start: string;
  week_end: string;
  quota?: number;
  registered?: number;
  with_topic?: number;
  ready?: number;
  satisfied?: boolean;
  plans?: { id: number; scheduled_date: string; topic: string; status: PlanStatus }[];
}

/* ─── 에디터 ───────────────────────────────────────── */

export interface PlanAsset {
  id: number;
  sort_order: number;
  kind: "image" | "video";
  width: number | null;
  height: number | null;
  bytes: number | null;
  is_ready: boolean;
  convert_error: string;
  alt_text: string;
  preview_url: string;
  uploaded_at: string;
}

export interface PublishJobItem {
  id: number;
  attempt_no: number;
  state: "pending" | "running" | "success" | "failed" | "manual_recovered";
  scheduled_at: string | null;
  ig_media_id: string;
  permalink: string;
  error_code: string;
  error_message: string;
  escalated_at: string | null;
  finished_at: string | null;
  recovered_by: string | null;
}

export interface AudioTrack {
  audio_id: string;
  title: string;
  artist: string;
  duration_ms: number | null;
  thumbnail_url: string;
}

export interface LocationResult {
  location_id: string;
  name: string;
  address: string;
}

export interface PlanDetail {
  id: number;
  owner_id: number;
  owner_name: string;
  scheduled_date: string;
  topic: string;
  media_type: MediaType;
  status: PlanStatus;
  caption: string;
  hashtag_count: number;
  desired_publish_at: string | null;
  card_count: number;
  is_reel: boolean;
  audio_id: string;
  audio_volume: number | null;
  reel_share_to_feed: boolean;
  reel_thumb_offset_ms: number | null;
  location_id: string;
  location_name: string;
  collaborator_usernames: string[];
  ready_at: string | null;
  assets: PlanAsset[];
  publish_jobs: PublishJobItem[];
  limits: { max_cards: number; max_hashtags: number; max_collaborators: number };
  validation: string[];
  can_edit: boolean;
  is_lead: boolean;
  is_owner: boolean;
  publish_enabled: boolean;
  // 3차 — 잠금 · 수정요청
  locked_at: string | null;
  unlocked_at: string | null;
  unlock_type: string;
  edit_request_count: number;
  edit_grant_at: string | null;
  comment_count: number;
}

/* ─── 3차 — 댓글 · 근태 ───────────────────────────── */

export interface CommentItem {
  id: number;
  plan_id: number;
  author_id: number | null;
  author_name: string;
  body: string;
  card_anchor: number | null;
  created_at: string;
  edited_at: string | null;
}

export interface AttendanceRow {
  account_id: number;
  name: string;
  is_active: boolean;
  weekly_quota: number;
  registered: number;
  not_registered: boolean;
  on_time: number;
  late: number;
  edit_requests: number;
  publish_failed_ref: number;
}

export interface AttendanceResponse {
  week_start: string;
  week_end: string;
  rows: AttendanceRow[];
}

export interface LockQueueItem {
  id: number;
  scheduled_date: string;
  topic: string;
  owner_id: number;
  owner_name: string;
  locked_at: string | null;
}

/* ─── 전역 설정 ────────────────────────────────────── */

export interface SatelliteSettingsResponse {
  email_enabled: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export const JOB_STATE_META: Record<
  PublishJobItem["state"],
  { label: string; cls: string }
> = {
  pending: { label: "대기", cls: "bg-gray-100 text-gray-500 border-gray-200" },
  running: { label: "발행 중", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  success: { label: "성공", cls: "bg-green-50 text-green-700 border-green-200" },
  failed: { label: "실패", cls: "bg-red-50 text-red-600 border-red-200" },
  manual_recovered: { label: "수동 연결", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

export interface DuplicateMatch {
  id: number;
  topic: string;
  scheduled_date: string;
  owner_name: string;
  same_week: boolean;
  severity: "high" | "info";
}

/* ─── 표시용 상수 ─────────────────────────────────── */

export const STATUS_META: Record<PlanStatus, { label: string; cls: string; dot: string }> = {
  draft: { label: "주제만", cls: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-300" },
  ready: { label: "준비완료", cls: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-500" },
  locked: { label: "잠김", cls: "bg-red-50 text-red-600 border-red-200", dot: "bg-red-400" },
  scheduled: { label: "발행대기", cls: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-400" },
  publishing: { label: "발행중", cls: "bg-indigo-50 text-indigo-700 border-indigo-200", dot: "bg-indigo-400" },
  published: { label: "발행완료", cls: "bg-periwinkle/10 text-periwinkle border-periwinkle/25", dot: "bg-periwinkle" },
  failed: { label: "발행실패", cls: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-400" },
};

export const MEDIA_META: Record<MediaType, { label: string }> = {
  carousel: { label: "카드뉴스" },
  reel: { label: "릴스" },
  image: { label: "단일이미지" },
};

/** 담당자별 색상 — id 를 안정적으로 팔레트에 매핑 */
export const OWNER_PALETTE = [
  { chip: "bg-sky-100 text-sky-700", dot: "bg-sky-400", cell: "bg-sky-50" },
  { chip: "bg-violet-100 text-violet-700", dot: "bg-violet-400", cell: "bg-violet-50" },
  { chip: "bg-amber-100 text-amber-700", dot: "bg-amber-400", cell: "bg-amber-50" },
  { chip: "bg-rose-100 text-rose-700", dot: "bg-rose-400", cell: "bg-rose-50" },
  { chip: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-400", cell: "bg-emerald-50" },
  { chip: "bg-cyan-100 text-cyan-700", dot: "bg-cyan-400", cell: "bg-cyan-50" },
  { chip: "bg-fuchsia-100 text-fuchsia-700", dot: "bg-fuchsia-400", cell: "bg-fuchsia-50" },
  { chip: "bg-lime-100 text-lime-700", dot: "bg-lime-400", cell: "bg-lime-50" },
];

export function ownerColor(ownerId: number) {
  return OWNER_PALETTE[ownerId % OWNER_PALETTE.length];
}

export const DAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

export function fmtMD(dateStr: string) {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export function dowKR(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return DAY_KR[new Date(y, m - 1, d).getDay()];
}
