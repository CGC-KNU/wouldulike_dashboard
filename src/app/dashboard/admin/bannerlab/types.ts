export type BannerRatio = "1:1" | "4:5" | "9:16" | "16:9";
export type BannerPlacement = "top" | "center" | "bottom";
export type BannerStatus = "draft" | "generated" | "archived";

export interface BannerCampaignSummary {
  id: number;
  title: string;
  ratio: BannerRatio;
  tone: string;
  font_label: string;
  ai_prompt: string;
  status: BannerStatus;
  status_label: string;
  slack_channel_id: string;
  restaurant_ids: number[];
  created_at: string;
  updated_at: string;
}

export interface BannerPhoto {
  id: number;
  url: string;
  sort_order: number;
  retouched_url: string;
  retouch_error: string;
  retouched_at: string | null;
}

export interface BannerCopy {
  id: number;
  text: string;
  placement: BannerPlacement;
  placement_label: string;
  text_color: string;
  sort_order: number;
}

export interface BannerVariant {
  id: number;
  photo_id: number;
  copy_id: number | null;
  copy_text: string;
  url: string;
  render_error: string;
  slack_posted: boolean;
  slack_error: string;
  selected: boolean;
  source_photo_ai: boolean;
  created_at: string;
}

export interface BannerCampaignDetail extends BannerCampaignSummary {
  photos: BannerPhoto[];
  copies: BannerCopy[];
  variants: BannerVariant[];
  slack_enabled: boolean;
  slack_default_channel: string;
  ai_retouch_enabled: boolean;
}
