import { test } from "node:test";
import assert from "node:assert/strict";
import { botReportData } from "../src/lib/draft/appReportBot";

test("봇용 데이터는 칸마다 읽는 데 필요한 값만 남긴다", () => {
  const out = botReportData({
    report: { type: "weekly", label: "9월 4주차", range: { start: "2026-09-21", end: "2026-09-27" } },
    sources: [{ key: "ga4" }],
    html: "<p>양식에만 쓰는 것</p>",
    groups: [{ key: "g1", label: "사용", metrics: [
      { key: "wau", label: "주간 사용자", value: 253, prev: 69, unit: "명", source: "ga4", status: "connected", sample: null, note: undefined },
      { key: "retention_w1", label: "가입 1주 후 복귀", value: null, status: "none", status_label: "표본 부족", source: "ga4" },
    ] }],
    funnel: [{ label: "앱 열기" }],
    coupon_funnel: { steps: [] },
    caveats: ["기기 단위입니다."],
  } as never) as { groups: { metrics: Record<string, unknown>[] }[]; [k: string]: unknown };
  assert.deepEqual(Object.keys(out).sort(), ["caveats", "coupon_funnel", "funnel", "groups", "report"]);
  assert.deepEqual(out.groups[0].metrics[0], { key: "wau", label: "주간 사용자", value: 253, prev: 69, unit: "명", status: "connected" });
  // 값이 없는 칸은 0 이 아니라 사유와 함께 — 「모름」과 0 을 섞지 않는다
  assert.deepEqual(out.groups[0].metrics[1], { key: "retention_w1", label: "가입 1주 후 복귀", status: "none", status_label: "표본 부족" });
  assert.deepEqual(out.caveats, ["기기 단위입니다."]);
});

test("그룹이 없어도 깨지지 않는다", () => {
  const out = botReportData({ report: {} } as never) as { groups: unknown[]; funnel: unknown; caveats: unknown[] };
  assert.deepEqual(out.groups, []); assert.equal(out.funnel, null); assert.deepEqual(out.caveats, []);
});
