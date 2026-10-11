import { test } from "node:test";
import assert from "node:assert/strict";
import { addPeriod, billingMonthsOf, invoiceCovers, isBillingMonth, periodRangeLabel } from "../src/lib/draft/types";

/** 여러 달치 계산서 — period 는 첫 달, months 가 덮는 개월 수. 없으면 한 달. */

test("addPeriod 는 해를 넘긴다", () => {
  assert.equal(addPeriod("2026-11", 2), "2027-01");
  assert.equal(addPeriod("2026-01", -1), "2025-12");
});

test("invoiceCovers: 첫 달부터 months 개월", () => {
  const inv = { period: "2026-11", months: 3 };
  assert.ok(invoiceCovers(inv, "2026-11") && invoiceCovers(inv, "2027-01"));
  assert.ok(!invoiceCovers(inv, "2026-10") && !invoiceCovers(inv, "2027-02"));
  assert.ok(invoiceCovers({ period: "2026-09" }, "2026-09"));
  assert.ok(!invoiceCovers({ period: "2026-09" }, "2026-10"));
});

test("isBillingMonth: 청구 시작 월부터 N달 간격", () => {
  const o = { billing_months: 3, billing_start_period: "2026-09" };
  assert.deepEqual(["2026-09", "2026-10", "2026-11", "2026-12", "2027-03"].map((p) => isBillingMonth(o, p)), [true, false, false, true, true]);
  assert.ok(isBillingMonth({ billing_months: null }, "2026-10"));
  // 시작 월이 없으면 계약 시작월, 그것도 없으면 1월 기준
  assert.ok(isBillingMonth({ billing_months: 3, contract_started_on: "2026-10-15" }, "2027-01"));
  assert.ok(isBillingMonth({ billing_months: 3 }, "2026-04") && !isBillingMonth({ billing_months: 3 }, "2026-05"));
  // 시작 월보다 앞선 달도 같은 간격으로 센다
  assert.ok(isBillingMonth({ billing_months: 3, billing_start_period: "2026-09" }, "2026-06"));
});

test("billingMonthsOf: 이상한 값은 매월", () => {
  assert.equal(billingMonthsOf({ billing_months: 0 }), 1);
  assert.equal(billingMonthsOf({ billing_months: 99 }), 1);
  assert.equal(billingMonthsOf({ billing_months: 6 }), 6);
});

test("periodRangeLabel", () => {
  assert.equal(periodRangeLabel("2026-09", 1), "2026년 9월");
  assert.equal(periodRangeLabel("2026-09", 3), "2026년 9~11월");
  assert.equal(periodRangeLabel("2026-11", 3), "2026년 11월~2027년 1월");
});
