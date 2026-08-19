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
  prompt_text: string;
  tone: string;
  font_label: string;
  ratio: BannerRatio;
  effect: string;
  popup_photo_url: string;
  banner_photo_url: string;
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

export interface WeeklyCandidate {
  id: number;
  sort_order: number;
  is_ai_retouched: boolean;
  selected: boolean;
  image_url: string;
  download_url: string;
  render_error: string;
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
