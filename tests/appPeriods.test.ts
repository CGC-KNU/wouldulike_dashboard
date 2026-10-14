import { test } from "node:test";
import assert from "node:assert/strict";
import { appPeriods, PERIOD_LABEL } from "../src/lib/draft/appPeriods";

/** Probe 앱 지표 위 기간 줄 — 칸의 기간 이름 → 실제로 센 날짜. */

// readGa4AppMetrics 가 확정 테이블 10/13 에서 거꾸로 잡은 창(anchored)
const ga4 = {
  week: { from: "2026-10-07", to: "2026-10-13" },
  cohort: { from: "2026-09-23", to: "2026-09-29" },
  push: { from: "2026-09-30", to: "2026-10-13" },
  banner: { from: "2026-09-09", to: "2026-10-06" },
};
const byKey = (r: ReturnType<typeof appPeriods>) => Object.fromEntries(r.map((p) => [p.key, p]));

test("GA4 쪽은 응답에 실제로 센 구간을 그대로 옮긴다 — MAU 는 같은 날 끝나는 30일", () => {
  const p = byKey(appPeriods({ since: "2026-10-01T00:00:00+09:00", countedAt: "2026-10-14T04:10:00Z", ga4 }));
  assert.equal(p.week.range, "10/7~10/13");
  assert.equal(p.mau.range, "9/14~10/13");
  assert.equal(p.push.range, "9/30~10/13");
  assert.equal(p.cohort.range, "9/23~9/29 첫 실행");
  assert.equal(p.banner.range, "9/9~10/6 배너 클릭");
  assert.match(p.cohort.note, /10\/13까지/);
});

test("DB 쪽 달의 경계와 「지금」은 KST — UTC 로 읽으면 하루 밀린다", () => {
  // 10/14 23:30 KST = 10/14 14:30Z, 10/1 0시 KST = 9/30 15:00Z
  const p = byKey(appPeriods({ since: "2026-09-30T15:00:00Z", countedAt: "2026-10-14T14:30:00Z", ga4 }));
  assert.equal(p.month.range, "10/1~10/14");
  assert.equal(p.now.range, "10/14 23:30");
  // 자정을 넘기면 다음 날 — 15:30Z = 10/15 0:30 KST
  const q = byKey(appPeriods({ since: "2026-10-01T00:00:00+09:00", countedAt: "2026-10-14T15:30:00Z", ga4 }));
  assert.equal(q.month.range, "10/1~10/15");
  assert.equal(q.now.range, "10/15 00:30");
});

test("달 첫날은 날짜 하나만", () => {
  const p = byKey(appPeriods({ since: "2026-11-01T00:00:00+09:00", countedAt: "2026-11-01T01:00:00Z", ga4 }));
  assert.equal(p.month.range, "11/1");
});

test("못 읽은 출처는 range 가 null — 날짜를 지어내지 않는다", () => {
  const noGa4 = byKey(appPeriods({ since: "2026-10-01T00:00:00+09:00", countedAt: "2026-10-14T04:10:00Z", ga4: null }));
  for (const k of ["week", "mau", "push", "cohort", "banner"]) assert.equal(noGa4[k].range, null, k);
  assert.equal(noGa4.month.range, "10/1~10/14");

  const noDb = byKey(appPeriods({ since: null, countedAt: null, ga4 }));
  assert.equal(noDb.month.range, null);
  assert.equal(noDb.now.range, null);
  assert.equal(noDb.week.range, "10/7~10/13");
});

test("기간 줄은 늘 일곱 — 칩 이름과 같은 이름을 쓴다", () => {
  const r = appPeriods({ since: null, countedAt: null, ga4: null });
  assert.deepEqual(r.map((p) => p.key), ["month", "now", "week", "mau", "push", "cohort", "banner"]);
  for (const p of r) assert.equal(p.label, PERIOD_LABEL[p.key]);
  assert.deepEqual(r.map((p) => p.group), ["db", "db", "ga4", "ga4", "ga4", "ga4", "ga4"]);
});
