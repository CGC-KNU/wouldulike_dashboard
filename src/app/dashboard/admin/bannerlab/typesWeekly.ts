import { BannerRatio } from "./types";

export type WeekType = "general" | "coupon" | "mileage" | "council";

export interface WeekFolder {
  id: number;
  month_id: number;
  week_number: number;
  type: WeekType;
  type_label: string;
  is_single_photo_type: boolean;
  sort_order: number;
  caption_text: string;
  prompt_text: string;
  ratio: BannerRatio;
  popup_photo_url: string;
  banner_photo_url: string;
  template_photo_url: string;
  figma_template_id: number | null;
  figma_template_name: string;
  student_council_name: string;
  excluded_restaurant_ids: number[];
  included_restaurant_ids: number[];
  updated_at: string;
  week_start: string;
  targets_summary: {
    total: number;
    selected: number;
    reused: number;
    applied: number;
    generated: boolean;
    banner: { total: number; selected: number; reused: number; applied: number };
    popup: { total: number; selected: number; reused: number; applied: number };
  };
}

export interface MonthFolder {
  id: number;
  month: number;
  sort_order: number;
  weeks: WeekFolder[];
}

export interface Semester {
  id: number;
  title: string;
  year: number;
  start_month: number;
  end_month: number;
  created_at: string;
}

export interface SemesterDetail extends Semester {
  months: MonthFolder[];
}

export type RestaurantTier = "FREE" | "BOOST" | "CONTENT";

export interface PaidRestaurant {
  restaurant_id: number;
  name: string;
  tier: RestaurantTier | null;
  is_paid: boolean;
  photo_url: string;
  photos: string[];
}

/** GET .../ai-diagnostics/ 응답 — 실제 OpenAI 호출 없이 AI 후보 시도 여부만 미리 확인. */
export interface AiDiagnostics {
  week_id: number;
  week_number: number;
  type: WeekType;
  openai_key_configured: boolean;
  prompt_text: string;
  caption_text: string;
  has_template_photo: boolean;
  figma_template_id: number | null;
  figma_enabled: boolean;
  would_attempt_ai: boolean;
  reasons_ai_would_be_skipped: string[];
}

export interface WeeklyCandidate {
  id: number;
  sort_order: number;
  is_ai_retouched: boolean;
  selected: boolean;
  image_url: string;
  download_url: string;
  render_error: string;
}

export interface FigmaTemplate {
  id: number;
  name: string;
  file_key: string;
  node_id: string;
  notes: string;
  created_at: string;
}

export interface WeeklyTarget {
  id: number;
  kind: "banner" | "popup";
  kind_label: string;
  restaurant_id: number | null;
  restaurant_name: string;
  status: "pending" | "selected" | "skipped" | "feedback";
  status_label: string;
  click_url: string;
  is_reuse: boolean;
  feedback_text: string;
  prompt_override: string;
  updated_at: string;
  candidates: WeeklyCandidate[];
}
