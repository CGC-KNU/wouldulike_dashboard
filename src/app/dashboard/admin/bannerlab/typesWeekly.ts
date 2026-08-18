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
  updated_at: string;
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

export interface PaidRestaurant {
  restaurant_id: number;
  name: string;
  photo_url: string;
}
