import { test } from "node:test";
import assert from "node:assert/strict";
import { byCategory, changePct, dueRows, dueTotals, invoiceIncome, itemAppliesIn, monthlySeries, recentPeriods, spotIncome, unknownIncomeCount, wonShort } from "../src/lib/finance/calc";
import { canViewFinance } from "../src/lib/finance/access";
import { checkEntry, checkItem, todayKst } from "../src/lib/finance/validate";
import { DEFAULT_ITEMS } from "../src/lib/finance/defaults";
import type { ExpenseEntry, ExpenseItem, IncomeEntry } from "../src/lib/finance/types";
import type { TaxInvoice } from "../src/lib/draft/types";
import type { SpotJob } from "../src/lib/draft/spot";

/** 재무 — 순수 로직. 열람 권한 · 입금 집계 · 예정 출금 · 입력 검사. */

const item = (o: Partial<ExpenseItem> = {}): ExpenseItem => ({
  id: "i1", key: null, name: "서버", category: "인프라", amount: 100_000, cycle: "MONTHLY", pay_day: 10,
  start_period: "2026-01", end_period: null, active: true, is_default: false, memo: null, updated_by: null, updated_at: null, ...o,
});
const entry = (o: Partial<ExpenseEntry> = {}): ExpenseEntry => ({
  id: "e1", item_id: null, paid_on: "2026-11-10", period: "2026-11", name: "서버", category: "인프라", amount: 100_000, memo: null, created_by: null, created_at: null, ...o,
});

test("열람은 민열·재민 두 사람만 — 대소문자·공백은 봐주고 나머지는 모두 막는다", () => {
  assert.equal(canViewFinance("minyeol"), true);
  assert.equal(canViewFinance(" Jaemin "), true);
  assert.equal(canViewFinance("minchan"), false);
  assert.equal(canViewFinance(""), false);
  assert.equal(canViewFinance(null), false);
  assert.equal(canViewFinance(undefined), false);
});

test("입금: 취소·반려된 계산서는 입금이 찍혀 있어도 뺀다, 날짜는 입금일", () => {
  const inv = (id: string, status: string, paid_at: string | null) => ({ id, name: `매장${id}`, title: "9월분", total: 33_000, status, paid_at }) as unknown as TaxInvoice;
  const got = invoiceIncome([inv("1", "ISSUED", "2026-11-03T00:00:00.000Z"), inv("2", "CANCELED", "2026-11-04T00:00:00.000Z"), inv("3", "REJECTED", "2026-11-05T00:00:00.000Z"), inv("4", "ISSUED", null)]);
  assert.deepEqual(got.map((g) => g.id), ["invoice:1"]);
  assert.equal(got[0].paid_on, "2026-11-03");
  assert.equal(got[0].amount, 33_000);
});

test("입금: 가격이 없는 스팟은 0원이 아니라 금액 미정(null) — 합계에 안 들어간다", () => {
  const spot = (id: string, price: number | null, paid_at: string | null) => ({ id, name: `스팟${id}`, product: "REELS", price, paid_at }) as unknown as SpotJob;
  const income = spotIncome([spot("a", 150_000, "2026-11-02"), spot("b", null, "2026-11-03"), spot("c", 0, "2026-11-04"), spot("d", 99, null)]);
  assert.equal(income.length, 3);
  assert.equal(income.find((i) => i.id === "spot:b")?.amount, null);
  // 0원(무료로 준 건)은 모름이 아니라 0 이다
  assert.equal(income.find((i) => i.id === "spot:c")?.amount, 0);
  const all: IncomeEntry[] = income;
  assert.equal(unknownIncomeCount(all, "2026-11"), 1);
  assert.equal(monthlySeries(all, [], ["2026-11"])[0].income, 150_000);
});

test("월별 현황: 입금·출금은 각자의 날짜로, 순입금은 차이", () => {
  const income: IncomeEntry[] = [{ id: "x", paid_on: "2026-10-31", amount: 500_000, source: "invoice", name: "a", detail: null }, { id: "y", paid_on: "2026-11-01", amount: 300_000, source: "invoice", name: "b", detail: null }];
  const out = [entry({ paid_on: "2026-11-10", amount: 120_000 }), entry({ id: "e2", paid_on: "2026-10-05", period: "2026-10", amount: 50_000 })];
  const rows = monthlySeries(income, out, ["2026-10", "2026-11"]);
  assert.deepEqual(rows.map((r) => [r.income, r.expense, r.net]), [[500_000, 50_000, 450_000], [300_000, 120_000, 180_000]]);
});

test("recentPeriods 는 해를 넘기고 오래된 달이 앞", () => {
  assert.deepEqual(recentPeriods("2027-02", 4), ["2026-11", "2026-12", "2027-01", "2027-02"]);
});

test("changePct: 지난달이 0 이면 비교하지 않는다", () => {
  assert.equal(changePct(120, 100), 20);
  assert.equal(changePct(50, 100), -50);
  assert.equal(changePct(10, 0), null);
});

test("분류별 출금은 그 달만, 큰 순", () => {
  const rows = byCategory([entry({ amount: 10, category: "도구·구독" }), entry({ id: "2", amount: 90, category: "인프라" }), entry({ id: "3", amount: 5, category: "기타", paid_on: "2026-10-01" })], "2026-11");
  assert.deepEqual(rows.map((r) => [r.category, r.amount]), [["인프라", 90], ["도구·구독", 10]]);
});

test("예정 출금: 쉬는 항목·시작 전·종료 후는 안 나오고, 기록이 있으면 빠진다", () => {
  assert.equal(itemAppliesIn(item({ active: false }), "2026-11"), false);
  assert.equal(itemAppliesIn(item({ start_period: "2026-12" }), "2026-11"), false);
  assert.equal(itemAppliesIn(item({ end_period: "2026-10" }), "2026-11"), false);
  assert.equal(itemAppliesIn(item(), "2026-11"), true);

  const items = [item(), item({ id: "i2", name: "툴", pay_day: 25 })];
  assert.equal(dueRows(items, [], "2026-11", "2026-11-20").length, 2);
  const done = dueRows(items, [entry({ item_id: "i1", period: "2026-11" })], "2026-11", "2026-11-20");
  assert.deepEqual(done.map((d) => d.item.id), ["i2"]);
  // 다른 달 기록은 이 달 예정을 지우지 않는다
  assert.equal(dueRows(items, [entry({ item_id: "i1", period: "2026-10" })], "2026-11", "2026-11-20").length, 2);
});

test("예정 출금: 지급일이 지났는데 기록이 없으면 overdue, 31일은 짧은 달 말일로", () => {
  const [a] = dueRows([item({ pay_day: 10 })], [], "2026-11", "2026-11-20");
  assert.equal(a.overdue, true);
  const [b] = dueRows([item({ pay_day: 25 })], [], "2026-11", "2026-11-20");
  assert.equal(b.overdue, false);
  const [c] = dueRows([item({ pay_day: 31 })], [], "2026-02", "2026-02-01");
  assert.equal(c.due_on, "2026-02-28");
  const [d] = dueRows([item({ pay_day: null })], [], "2026-11", "2026-11-30");
  assert.equal(d.due_on, null);
  assert.equal(d.overdue, false);
});

test("매년 항목은 시작한 달에만 나온다", () => {
  const yearly = item({ cycle: "YEARLY", start_period: "2026-03" });
  assert.equal(itemAppliesIn(yearly, "2027-03"), true);
  assert.equal(itemAppliesIn(yearly, "2027-04"), false);
});

test("예정 합계는 금액을 아는 것만, 모르는 건 따로 센다", () => {
  const rows = dueRows([item({ amount: 100 }), item({ id: "2", amount: null })], [], "2026-11", "2026-11-01");
  assert.deepEqual(dueTotals(rows), { amount: 100, unknown: 1 });
});

test("wonShort 는 만 · 억 단위로 줄인다", () => {
  assert.equal(wonShort(0), "0");
  assert.equal(wonShort(9_999), "9,999");
  assert.equal(wonShort(1_250_000), "125만");
  assert.equal(wonShort(100_000_000), "1억");
});

test("기본 항목은 금액을 지어내지 않는다 — 항목 모양에 amount 가 아예 없다", () => {
  assert.ok(DEFAULT_ITEMS.length > 0);
  assert.equal(new Set(DEFAULT_ITEMS.map((d) => d.key)).size, DEFAULT_ITEMS.length, "key 는 유일해야 멱등이 된다");
  for (const d of DEFAULT_ITEMS) assert.equal("amount" in d, false);
});

test("출금 검사: 나간 날은 오늘 이후 불가, 금액은 양의 정수, 귀속 월은 나간 달이 기본", () => {
  const today = "2026-11-21";
  const ok = checkEntry({ paid_on: "2026-11-20", name: " 서버 ", category: "인프라", amount: "1,500,000" }, false, today);
  assert.ok(ok.ok);
  if (ok.ok) { assert.equal(ok.value.amount, 1_500_000); assert.equal(ok.value.period, "2026-11"); assert.equal(ok.value.name, "서버"); }

  assert.equal(checkEntry({ paid_on: "2026-11-22", name: "a", amount: 1 }, false, today).ok, false, "미래 날짜");
  assert.equal(checkEntry({ paid_on: "2026-02-30", name: "a", amount: 1 }, false, today).ok, false, "없는 날짜");
  assert.equal(checkEntry({ paid_on: "2026-11-20", name: "a", amount: 0 }, false, today).ok, false, "0원");
  assert.equal(checkEntry({ paid_on: "2026-11-20", name: "a", amount: -5 }, false, today).ok, false, "음수");
  assert.equal(checkEntry({ paid_on: "2026-11-20", name: "a", amount: 1.5 }, false, today).ok, false, "소수");
  assert.equal(checkEntry({ paid_on: "2026-11-20", name: "  ", amount: 10 }, false, today).ok, false, "이름 없음");
});

test("출금 검사: 목록에 없는 분류는 기타로, 부분 수정은 온 칸만 본다", () => {
  const r = checkEntry({ paid_on: "2026-11-20", name: "a", amount: 10, category: "엉뚱" }, false, "2026-11-21");
  assert.ok(r.ok && r.value.category === "기타");
  const p = checkEntry({ amount: 777 }, true, "2026-11-21");
  assert.ok(p.ok);
  if (p.ok) assert.deepEqual(Object.keys(p.value), ["amount"]);
});

test("항목 검사: 금액은 비우면 모름(null), 0 은 무료, 종료가 시작보다 앞이면 막는다", () => {
  const blank = checkItem({ name: "툴", start_period: "2026-11", amount: "" }, false);
  assert.ok(blank.ok && blank.value.amount === null);
  const zero = checkItem({ name: "툴", start_period: "2026-11", amount: 0 }, false);
  assert.ok(zero.ok && zero.value.amount === 0);
  assert.equal(checkItem({ name: "툴", start_period: "2026-11", end_period: "2026-10" }, false).ok, false);
  assert.equal(checkItem({ name: "", start_period: "2026-11" }, false).ok, false);
  assert.equal(checkItem({ name: "툴", start_period: "2026-13" }, false).ok, false);
  assert.equal(checkItem({ name: "툴", start_period: "2026-11", pay_day: 32 }, false).ok, false);
  assert.equal(checkItem({ name: "툴", start_period: "2026-11", amount: "abc" }, false).ok, false);
  assert.equal(checkItem({ name: "툴", start_period: "2026-11", cycle: "WEEKLY" }, false).ok, false);
});

test("todayKst 는 UTC 가 아직 어제여도 한국 날짜", () => {
  // 2026-11-20 16:30 UTC = 2026-11-21 01:30 KST
  assert.equal(todayKst(Date.UTC(2026, 10, 20, 16, 30)), "2026-11-21");
});
