import { test } from "node:test";
import assert from "node:assert/strict";
import { liveReportFor } from "../src/lib/draft/insights";
import type { StoreReport } from "../src/lib/draft/types";

/**
 * 화면 「만들 때」와 14일차 자동 초안이 같은 판정을 쓴다 (1014).
 * 자동만 회수본을 「이미 리포트 있음」으로 세서, 화면은 만들라는데 자동은 건너뛰었다.
 */

const rep = (id: string, status: StoreReport["status"], plan_id: number, restaurant_id: number | null, name = "가게") =>
  ({ id, status, plan_id, restaurant_id, snapshot: { store: { name } } }) as unknown as StoreReport;

test("회수된 리포트만 있으면 없는 것으로 본다 — 자동 초안이 만든다", () => {
  assert.equal(liveReportFor([rep("a", "REVOKED", 7, 146)], 7, 146, "가게"), null);
});

test("회수본 옆에 살아 있는 리포트가 있으면 그것을 준다", () => {
  assert.equal(liveReportFor([rep("a", "REVOKED", 7, 146), rep("b", "DRAFT", 7, 146)], 7, 146, "가게")?.id, "b");
});

test("다른 게시물·다른 매장 리포트는 세지 않는다", () => {
  assert.equal(liveReportFor([rep("a", "SENT", 8, 146), rep("b", "SENT", 7, 147)], 7, 146, "가게"), null);
});

test("앱에 없는 협찬 매장은 이름으로 맞춘다", () => {
  assert.equal(liveReportFor([rep("a", "SENT", 7, null, "교동 후추")], 7, null, "교동후추")?.id, "a");
  assert.equal(liveReportFor([rep("a", "SENT", 7, null, "다른집")], 7, null, "교동후추"), null);
});
