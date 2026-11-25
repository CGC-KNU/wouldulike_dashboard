import { test } from "node:test";
import assert from "node:assert/strict";
import { postNote, postStats, scheduleRows } from "../src/lib/owner/contentPosts";
import type { PromotionPost } from "../src/lib/owner/homeMetrics";

const post = (over: Partial<PromotionPost> = {}): PromotionPost => ({
  posted_at: "2026-11-20", title: "가을 점심 큐레이션", format: "carousel", permalink: "https://instagram.com/p/a",
  views: 1200, reach: 800, likes: 0, saved: 4, shares: null, comments: 1,
  captured_at: "2026-11-23T03:00:00+09:00", status: "ok", report_sent: true, ...over,
});

test("postStats: 0 은 보이고 못 잰 값(null)은 빠진다", () => {
  assert.deepEqual(postStats(post()).map((s) => s.label), ["조회", "도달", "좋아요", "저장", "댓글"]);
  assert.equal(postStats(post()).find((s) => s.label === "좋아요")?.value, "0");
  assert.equal(postStats(post()).find((s) => s.label === "조회")?.value, "1,200");
});

test("postNote: 못 잰 글은 0 이 아니라 집계 준비 중", () => {
  const pending = post({ status: "pending", captured_at: null, views: null, reach: null, likes: null, saved: null, comments: null });
  assert.deepEqual(postStats(pending), []);
  assert.match(postNote(pending), /집계 준비 중/);
  assert.equal(postNote(post()), "11/23 수집");
  assert.match(postNote(post({ status: "stale" })), /늦어지고/);
});

test("scheduleRows: 성과 칸과 겹치는 게시된 글만 빼고, 안 잡힌 글·예정·캠페인은 남긴다", () => {
  const feed = [
    { kind: "post", date: "2026-11-20", title: "가을 점심 큐레이션", state: "published", permalink: "https://instagram.com/p/a" },
    { kind: "post", date: "2026-11-18", title: "제목 대조로만 잡힌 글", state: "published", permalink: "https://instagram.com/p/b" },
    { kind: "post", date: "2026-11-30", title: "예정 글", state: "scheduled", permalink: "" },
    { kind: "campaign", date: "2026-11-24", end: "2026-12-04", title: "기말 캠페인", state: "active" },
    { kind: "activity", date: "2026-11-21", title: "담당자 방문", state: "done" },
  ];
  assert.deepEqual(scheduleRows(feed, [post()]).map((f) => f.title), ["제목 대조로만 잡힌 글", "예정 글", "기말 캠페인"]);
  // 링크가 없어도 같은 날·같은 제목이면 겹친 것이다
  assert.equal(scheduleRows([{ ...feed[0], permalink: "" }], [post({ permalink: null })]).length, 0);
  // 성과 칸이 비어 있으면(구 백엔드) 전과 같다
  assert.equal(scheduleRows(feed, []).length, 4);
});
