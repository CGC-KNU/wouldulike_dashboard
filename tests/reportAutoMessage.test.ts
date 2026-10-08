import { test } from "node:test";
import assert from "node:assert/strict";
import { draftMessage, postedKst, reporterMentions, slackIdOf } from "../src/lib/draft/reportAutoMessage";
import type { StoreReport } from "../src/lib/draft/types";

/**
 * 게시 14일차 #ops-partner 메시지 — 백엔드 「14일 경과」 알림을 합친 하나 (민찬 1008).
 * 그쪽에 있던 콘텐츠 · 올라간 때 · 제작 담당 · 담당자 호출이 여기 들어 있어야 한다.
 */

const report = {
  id: "rep_abc", title: "한끼갈비 인스타그램 홍보 성과",
  snapshot: {
    store: { name: "한끼갈비", campus: null },
    post: { plan_id: 40, topic: "대구 대학가 가성비 맛집 (한끼갈비 포함)", posted_at: "2026-08-31T09:54:19+00:00", permalink: "https://www.instagram.com/p/x/", format: "carousel", caption: null, cover_url: null, owner_name: "담당자A", co_stores: 1 },
  },
} as unknown as StoreReport;

test("14일차 메시지 하나에 초안 안내 · 콘텐츠 · 올라간 때 · 제작 담당 · 담당자 호출 · 두 링크가 다 있다", () => {
  const t = draftMessage(report, "https://app.wouldulike.kr", "가 나 다");
  assert.equal(t, [
    ":memo: *매장 리포트 초안* — 한끼갈비",
    "• 한끼갈비 인스타그램 홍보 성과",
    "• 게시 14일차 자동 작성",
    "• 콘텐츠  대구 대학가 가성비 맛집 (한끼갈비 포함)",
    "• 올라간 때  8/31 18:54",
    "• 제작 담당  담당자A",
    "가 나 다 — *초안에 인스타 지표 입력을 진행해 주세요.*",
    "• 인스타 게시물 <https://www.instagram.com/p/x/|인스타그램에서 보기>",
    "• 세틀라이트 리포트 <https://app.wouldulike.kr/dashboard/admin?tab=probe-reports&open=rep_abc|리포트 열기>",
  ].join("\n"));
});

test("부를 사람 — 슬랙 멤버 ID 면 진짜 멘션, 이름이면 글자로(백엔드와 같은 규칙) · 비우면 호출 없이", () => {
  assert.equal(reporterMentions("U01ABCDEF, 나 ,W0XYZ12345"), "<@U01ABCDEF> 나 <@W0XYZ12345>");
  assert.equal(reporterMentions(""), "");
  assert.equal(reporterMentions("U01ABCDEF,<!channel>,a|b"), "<@U01ABCDEF>", "슬랙 서식 글자가 든 항목은 버린다");
  assert.match(draftMessage(report, "https://x", ""), /^\*초안에 인스타 지표 입력을 진행해 주세요\.\*$/m);
});

test("기본 「준영,서지,민찬」은 팀 명단의 슬랙 ID 로 진짜 멘션이 된다 (1008 — @로 태그)", () => {
  assert.equal(reporterMentions("준영,서지,민찬"), "<@U0BP7TXJXP1> <@U0BTK413Q3F> <@U0BPR7SUHJ5>");
  assert.equal(reporterMentions(), "<@U0BP7TXJXP1> <@U0BTK413Q3F> <@U0BPR7SUHJ5>", "환경변수가 없으면 기본값");
  assert.equal(slackIdOf("주준영"), "U0BP7TXJXP1", "성까지 써도");
  assert.equal(slackIdOf("명단에없음"), null);
  assert.equal(reporterMentions("명단에없음"), "명단에없음", "못 찾으면 이름 글자로");
});

test("올라간 때는 KST — 날짜만 오면 날짜만", () => {
  assert.equal(postedKst("2026-10-02T12:05:00+00:00"), "10/2 21:05");
  assert.equal(postedKst("2026-09-15"), "9/15");
  assert.equal(postedKst(null), null);
  assert.equal(postedKst("모름"), null);
});
