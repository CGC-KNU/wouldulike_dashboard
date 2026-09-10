/**
 * 세틀라이트 툴 레지스트리 — 런처·셸·슬랙 링크가 같은 정의를 본다.
 *
 * 아이콘은 `00_레퍼런스_네이밍/툴_아이콘` 원본(SVG, 단색 선 하나)을 `public/satellite/` 에 복사한 것이다.
 * 슬랙은 채널 **이름**으로 연결한다 (`app_redirect?channel=`). 워크스페이스에 로그인돼 있으면 열린다.
 * 채널 ID 를 아는 곳은 ID 를 우선한다. 지금은 초안이라 링크만 두고, 실제 연동(알림·수집)은 뒤에 붙인다.
 */

export type ToolKey = "papillon" | "astro" | "aether" | "probe" | "castor" | "libra";

export interface ToolMeta {
  key: ToolKey;
  name: string;
  subtitle: string;
  description: string;
  /** 주로 쓰는 사람. 런처 카드에 보인다. */
  users: string;
  slack: { channel: string; id?: string };
  icon: string; // /satellite/<key>.svg (선), /satellite/<key>_app.svg (앱판)
  status: "live" | "draft" | "external";
}

export const TOOLS: Record<ToolKey, ToolMeta> = {
  papillon: {
    key: "papillon",
    name: "Papillon",
    subtitle: "마케팅",
    description: "협찬 캘린더 · 콘텐츠 칸반 · 인스타 에디터 · 발행 · 성과",
    users: "아윤 · 윤지 · 채린",
    slack: { channel: "sat-papillon" },
    icon: "/satellite/papillon.svg",
    status: "live",
  },
  astro: {
    key: "astro",
    name: "Astro",
    subtitle: "영업",
    description: "매장 현황 · 입점 후보 파이프라인 · 입금·계산서 · 쿠폰·스탬프",
    users: "준영 · 정환 · 윤지",
    slack: { channel: "sat-astro-세일즈", id: "C0BPP3ACEUA" },
    icon: "/satellite/astro.svg",
    status: "draft",
  },
  probe: {
    key: "probe",
    name: "Probe",
    subtitle: "데이터",
    description: "매장 지표 · 앱 지표 · 데이터 정합성 점검",
    users: "민찬 · 민구",
    slack: { channel: "sat-probe" },
    icon: "/satellite/probe.svg",
    status: "draft",
  },
  castor: {
    key: "castor",
    name: "Castor",
    subtitle: "앱 구조",
    description: "화면 지도(코드 자동 파싱) · 블록 배치 · A/B 후보",
    users: "민구 · 재민 · 민열",
    slack: { channel: "sat-castor" },
    icon: "/satellite/castor.svg",
    status: "draft",
  },
  aether: {
    key: "aether",
    name: "Aether",
    subtitle: "관리·운영",
    description: "배너 & 팝업 · 마케팅 발송 · 관리자 설정",
    users: "재민",
    slack: { channel: "code-119" },
    icon: "/satellite/aether.svg",
    status: "live",
  },
  libra: {
    key: "libra",
    name: "Libra",
    subtitle: "비서",
    description: "슬랙 Q&A 봇 · ?현황 · ?매장 · 아침 브리핑",
    users: "전원",
    slack: { channel: "sat-libra", id: "C0BPP3E2GJE" },
    icon: "/satellite/libra.svg",
    status: "external",
  },
};

/** 런처에 보이는 순서. 제작 순서(Papillon→Astro→Probe→Castor)와 같다. */
export const TOOL_ORDER: ToolKey[] = ["papillon", "astro", "probe", "castor", "aether", "libra"];

export function slackUrl(t: ToolMeta): string {
  return t.slack.id
    ? `https://slack.com/app_redirect?channel=${t.slack.id}`
    : `https://slack.com/app_redirect?channel=${encodeURIComponent(t.slack.channel)}`;
}

/** 팀 세일즈 시트. 공개 CSV export 가 열려 있어 읽기는 인증 없이 된다 (2026-08-30 확인). */
export const SALES_SHEET = {
  id: "16iayAaXC33xm2xQnWHBQ-grpNI2SL8-vm968bZtcu-s",
  tabs: {
    현황: 0,
    신규: 1286917822,
    후보: 1257471984,
    계약: 1602074817,
  },
  url(gid: number) {
    return `https://docs.google.com/spreadsheets/d/${this.id}/edit#gid=${gid}`;
  },
  csv(gid: number) {
    return `https://docs.google.com/spreadsheets/d/${this.id}/export?format=csv&gid=${gid}`;
  },
} as const;
