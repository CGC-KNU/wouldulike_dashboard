import test from "node:test";
import assert from "node:assert/strict";
import { missingAppWarnNow } from "../src/app/dashboard/admin/probe/kit";

/** 「앱 회차 없음」 경고 — 추첨(그날 11:00 KST) 12시간 전부터 마감 때까지만. 지난 회차는 안 띄운다(1022). */
const kst = (iso: string) => Date.parse(`${iso}+09:00`);

test("추첨 12시간 전(전날 23:00)부터 띄운다", () => {
  assert.equal(missingAppWarnNow("2026-10-23", kst("2026-10-22T22:59:00")), false);
  assert.equal(missingAppWarnNow("2026-10-23", kst("2026-10-22T23:00:00")), true);
  assert.equal(missingAppWarnNow("2026-10-23", kst("2026-10-23T10:59:00")), true);
});

test("마감 시각이 지나면 — 지난 회차는 안 띄운다", () => {
  assert.equal(missingAppWarnNow("2026-10-23", kst("2026-10-23T11:00:00")), false);
  assert.equal(missingAppWarnNow("2026-10-02", kst("2026-10-22T09:00:00")), false);
});

test("3일 전에는 아직 안 띄운다", () => {
  assert.equal(missingAppWarnNow("2026-10-23", kst("2026-10-20T11:00:00")), false);
});
