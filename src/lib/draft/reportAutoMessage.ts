import { FOUNDERS, GROUPS } from "../atlas";
import { reportPermalink } from "./reportPage";
import type { StoreReport } from "./types";

/**
 * 게시 14일차 #ops-partner 메시지 — **14일차에 나가는 알림은 이것 하나다** (민찬 1008 「합쳐줘」).
 *
 * 전에는 같은 날 두 개가 갔다: 백엔드 partner_content_alerts 의 「14일 경과 — 인사이트 보고 부탁드립니다」(영업 담당 호출)와
 * 이 자동 초안 알림(#259). 백엔드는 이제 올라간 날 알림만 보내고, 그쪽에 있던 콘텐츠 · 올라간 때 · 제작 담당 · 담당자 호출을 여기로 옮겼다.
 */

/**
 * 이름 → 슬랙 멤버 ID — 팀 명단(atlas.ts, users.list 실측)에서 찾는다. 「민찬」처럼 성을 빼고 써도 한 사람에게만 맞으면 그 사람.
 * 못 찾거나 여럿이 맞으면 null — 그때는 이름 글자로 나간다(엉뚱한 사람을 부르지 않는다).
 */
export function slackIdOf(name: string): string | null {
  const people = [...FOUNDERS, ...GROUPS.flatMap((g) => g.people)].filter((p) => p.slack);
  const exact = people.find((p) => p.name === name);
  if (exact) return exact.slack!;
  const given = [...new Map(people.filter((p) => p.name.slice(1) === name).map((p) => [p.name, p])).values()];
  return given.length === 1 ? given[0].slack! : null;
}

/**
 * 부를 사람 — 슬랙 멤버 ID(U…/W…)는 그대로, 이름은 팀 명단에서 ID 를 찾아 **진짜 멘션**으로(1008 — 「@로 태그 가능해?」).
 * 기본은 백엔드 partner_content 와 같은 「준영,서지,민찬」. 바꾸려면 GitHub 저장소 변수 SLACK_PARTNER_REPORTERS(워크플로 헤더로 온다).
 * 슬랙 서식 글자(< > & | !)가 든 항목은 버린다 — 「<!channel>」 같은 걸로 채널 전체를 부르지 않게.
 */
export function reporterMentions(raw: string = process.env.SLACK_PARTNER_REPORTERS ?? "준영,서지,민찬"): string {
  return raw.split(",").map((x) => x.trim()).filter((x) => x && x.length <= 40 && !/[<>&|!]/.test(x))
    .map((r) => { const id = /^[UWB][A-Z0-9]{6,}$/.test(r) ? r : slackIdOf(r); return id ? `<@${id}>` : r; }).join(" ");
}

/** 올라간 때 — KST 「M/D HH:mm」(백엔드 알림과 같은 꼴). 시각이 없는 날짜만 오면 「M/D」. */
export function postedKst(v: string | null | undefined): string | null {
  if (!v) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(v);
  const d = new Date(dateOnly ? `${v}T00:00:00+09:00` : v);
  if (Number.isNaN(d.getTime())) return null;
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const md = `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
  return dateOnly ? md : `${md} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

export function draftMessage(r: StoreReport, origin: string, mentions: string = reporterMentions()): string {
  const insta = reportPermalink(r);
  const post = r.snapshot.post;
  const when = postedKst(post.posted_at ?? r.snapshot.report_data?.post?.posted_at);
  return [
    `:memo: *매장 리포트 초안* — ${r.snapshot.store.name || "매장"}`,
    `• ${r.title || r.id}`,
    "• 게시 14일차 자동 작성",
    ...(post.topic ? [`• 콘텐츠  ${post.topic}`] : []),
    ...(when ? [`• 올라간 때  ${when}`] : []),
    ...(post.owner_name ? [`• 제작 담당  ${post.owner_name}`] : []),
    `${mentions ? `${mentions} — ` : ""}*초안에 인스타 지표 입력을 진행해 주세요.*`,
    ...(insta ? [`• 인스타 게시물 <${insta}|인스타그램에서 보기>`] : []),
    `• 세틀라이트 리포트 <${origin}/dashboard/admin?tab=probe-reports&open=${encodeURIComponent(r.id)}|리포트 열기>`,
  ].join("\n");
}
