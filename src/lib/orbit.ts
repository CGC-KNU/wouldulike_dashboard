/**
 * Orbit — 여러 팀이 걸친 큰 일의 현황판 (1011).
 *
 * 값은 백엔드 AdminConfig `orbit:board` 하나(이 저장소는 공개라 기획 내용을 코드에 두지 않는다).
 * 단계는 10-10 #general 필독 글의 4단계 + 끝남 · 보류. 「최근 소식」은 리브라가 슬랙에서 그 건이 언급되면 넣는다.
 * 민열님 결정(10-11): 팀원 누구나 만들고 고침 · 슬랙에 남기는 건 단계 변경만 · 홈에는 전부.
 */
export const STAGES = ["이슈 제기", "승인 · 일정 심의", "구체화", "실무"] as const;
export const SIDE = ["끝남", "보류"] as const;
export type Stage = (typeof STAGES)[number] | (typeof SIDE)[number];

export interface Todo { id: string; text: string; done: boolean; by?: string; at?: string }
export interface Feed { at: string; who?: string; ch?: string; chn?: string; text: string; url?: string; ts?: string; q?: boolean }
export interface Project {
  id: string; name: string; stage: Stage; owners: string[]; team: string; due: string; summary: string;
  keywords: string[]; slack: { url: string; ch?: string; ts?: string };
  todos: Todo[]; feed: Feed[]; stage_log?: { from: string; to: string; by: string; at: string }[];
  created_by?: string; created_at?: string;
}
export interface Board { projects: Project[]; updated_at: string | null; updated_by?: string | null }

export const stageIndex = (s: Stage) => (STAGES as readonly string[]).indexOf(s);
export const waiting = (p: Project) => p.feed.filter((f) => f.q).length;
/** 막힌 것 먼저 — 답 대기 많은 순 → 단계 낮은 순 */
export const byUrgency = (a: Project, b: Project) => waiting(b) - waiting(a) || stageIndex(a.stage) - stageIndex(b.stage);

/** 슬랙 메시지 링크 → 채널 · ts. https://x.slack.com/archives/C0BPSQ7F8LC/p1791622381767369 */
export function parseSlack(url: string): { ch?: string; ts?: string } {
  const m = url.match(/archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})/);
  return m ? { ch: m[1], ts: `${m[2]}.${m[3]}` } : {};
}

export const blank = (by: string): Project => ({
  id: Math.random().toString(36).slice(2, 12), name: "", stage: "이슈 제기", owners: [], team: "", due: "", summary: "",
  keywords: [], slack: { url: "" }, todos: [], feed: [], created_by: by, created_at: new Date().toISOString(),
});
