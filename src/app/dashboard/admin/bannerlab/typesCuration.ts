/** 큐레이션 자동화(2026-09-27) — 백엔드 bannerlab/views_curation.py 응답 모양. */

export type CurationStatus = "pending" | "generating" | "ready" | "sent" | "approved" | "excluded" | "failed";
export type CurationKind = "always" | "weekday" | "timeslot" | "special_day" | "weather";
export type RedoMode = "topic" | "copy" | "photo" | "feedback";

export interface CurationConditions {
  dates?: string[];
  time_slots?: string[];
  weather?: string;
}

export interface CurationBanner {
  id: number;
  restaurant_id: number;
  restaurant_name: string;
  status: CurationStatus;
  status_label: string;
  topic_kind: CurationKind;
  topic: string;
  conditions: CurationConditions;
  tag_text: string;
  copy_text: string;
  benefit_text: string;
  reason: string;
  confidence: number | null;
  image_url: string;
  fallback: { tag: string; copy: string; image_url: string } | null;
  photo_url: string;
  ai_meta: { attempts?: number; rejections?: string[]; fallback_used?: boolean; photo_count?: number; model?: string };
  feedback_text: string;
  generation_error: string;
  approved_by: string;
  approved_at: string | null;
  slack_sent: boolean;
  updated_at: string | null;
}

export interface WeekContext {
  week_start: string;
  week_end: string;
  days: { date: string; weekday: string }[];
  special_days: { name: string; kind: string; hint: string; dates: string[] }[];
  weather: { date: string; pop: number; sky: string; tmin: number | null; tmax: number | null; flags: string[]; source: string }[];
  weather_available: boolean;
  weather_kinds: string[];
  built_at: string;
}

export interface WeekCuration {
  week_id: number;
  week_start: string;
  enabled: boolean;
  template_id: number | null;
  max_items: number;
  context: WeekContext | null;
  slack_sent_at: string | null;
  weather_checks: Record<string, { at: string; flags: string[]; error?: string }>;
  banners: CurationBanner[];
}

/** 배너 스튜디오 buildSpec() 모양 그대로 — 서버(studio_render.py)가 같은 규칙으로 그린다. */
export interface StudioSpec {
  mode?: string;
  ratio: { width: number; height: number };
  backgroundImage: { file?: string | null; zoomPct: number; posXPct: number; posYPct: number };
  bottomGradient: { intensityPct: number; coveragePct: number };
  textLayers: Record<string, unknown>[];
  imageAssets: { file: string | null; widthPct: number; centerXPct: number; centerYPct: number }[];
}

export interface CurationTemplate {
  id: number;
  name: string;
  spec: StudioSpec;
  canvas_width: number;
  canvas_height: number;
  asset_keys: Record<string, string>;
  copy_guide: string;
  tag_max_chars: number;
  copy_max_chars_per_line: number;
  copy_max_lines: number;
  is_active: boolean;
  tokens: string[];
  updated_at: string | null;
}

export interface SpecialDay {
  id: number;
  date: string;
  end_date: string | null;
  name: string;
  kind: "holiday" | "event" | "academic";
  hint: string;
  active: boolean;
}

export const STATUS_STYLE: Record<CurationStatus, string> = {
  pending: "bg-gray-100 text-gray-500",
  generating: "bg-sky-50 text-sky-600",
  ready: "bg-amber-50 text-amber-600",
  sent: "bg-periwinkle/10 text-periwinkle",
  approved: "bg-emerald-50 text-emerald-600",
  excluded: "bg-gray-100 text-gray-400",
  failed: "bg-rose-50 text-rose-600",
};

export const KIND_LABEL: Record<CurationKind, string> = {
  always: "상시",
  weekday: "요일",
  timeslot: "시간대",
  special_day: "특정일",
  weather: "날씨",
};

export const SLOT_LABEL: Record<string, string> = {
  morning: "아침",
  lunch: "점심",
  afternoon: "오후",
  dinner: "저녁",
  night: "밤·야식",
};

export const WEATHER_LABEL: Record<string, string> = {
  rain: "비 오는 날",
  snow: "눈 오는 날",
  cold: "추운 날",
  hot: "더운 날",
};
