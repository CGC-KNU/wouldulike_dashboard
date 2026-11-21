import { test } from "node:test";
import assert from "node:assert/strict";
import { balancesIn, billingLines, burnSummary, byCategory, changePct, dueRows, dueTotals, invoiceIncome, itemAppliesIn, latestBalances, monthlySeries, mrrOf, paidStoreCount, recentPeriods, reconcile, resolveAmount, restrictedLeft, runwayOf, spotIncome, unknownIncomeCount, vatPayable, wonShort } from "../src/lib/finance/calc";
import { canViewFinance } from "../src/lib/finance/access";
import { checkBalance, checkEntry, checkFunding, checkFundingWhole, checkItem, todayKst } from "../src/lib/finance/validate";
import { DEFAULT_ITEMS } from "../src/lib/finance/defaults";
import type { AccountBalance, ExpenseEntry, ExpenseItem, FundingEvent, IncomeEntry, PaidStore } from "../src/lib/finance/types";
import type { TaxInvoice } from "../src/lib/draft/types";
import type { SpotJob } from "../src/lib/draft/spot";

/** 재무 — 순수 로직. 열람 권한 · 입금 집계 · 예정 출금 · 입력 검사. */

const item = (o: Partial<ExpenseItem> = {}): ExpenseItem => ({
  id: "i1", key: null, name: "서버", category: "인프라", method: "FIXED", amount: 100_000, cycle: "MONTHLY", pay_day: 10,
  start_period: "2026-01", end_period: null, behavior: null, account: null, active: true, is_default: false, memo: null, updated_by: null, updated_at: null, ...o,
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
  const income: IncomeEntry[] = [{ id: "x", paid_on: "2026-10-31", amount: 500_000, supply: null, tax: null, source: "invoice", name: "a", detail: null }, { id: "y", paid_on: "2026-11-01", amount: 300_000, supply: null, tax: null, source: "invoice", name: "b", detail: null }];
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

const stores = (...starts: (string | null)[]): PaidStore[] => starts.map((start, i) => ({ id: i + 1, name: `매장${i + 1}`, start }));

test("유료 식당 수: 청구 시작 월이 그 달보다 뒤인 매장은 아직 안 센다, 시작이 없으면 처음부터", () => {
  const s = stores(null, "2026-09", "2026-11", "2026-12");
  assert.equal(paidStoreCount(s, "2026-08"), 1);
  assert.equal(paidStoreCount(s, "2026-11"), 3);
  assert.equal(paidStoreCount(s, "2026-12"), 4);
});

test("유료 식당 수: 못 읽었으면(null) 0 곳이 아니라 모름, 읽었는데 비었으면 0", () => {
  assert.equal(paidStoreCount(null, "2026-11"), null);
  assert.equal(paidStoreCount([], "2026-11"), 0);
});

test("출금 방식: 고정은 금액 그대로, 유료 식당 수 방식은 단가 × 곳 수", () => {
  assert.equal(resolveAmount({ method: "FIXED", amount: 50_000 }, 12), 50_000);
  assert.equal(resolveAmount({ method: "PER_PAID_STORE", amount: 3_000 }, 12), 36_000);
  assert.equal(resolveAmount({ method: "PER_PAID_STORE", amount: 3_000 }, 0), 0, "0곳이면 0원 — 모름이 아니다");
});

test("출금 방식: 단가나 곳 수를 모르면 0 이 아니라 null", () => {
  assert.equal(resolveAmount({ method: "PER_PAID_STORE", amount: null }, 12), null);
  assert.equal(resolveAmount({ method: "PER_PAID_STORE", amount: 3_000 }, null), null);
  assert.equal(resolveAmount({ method: "FIXED", amount: null }, 12), null);
  // 고정 금액은 유료 식당 수를 못 읽어도 상관없다
  assert.equal(resolveAmount({ method: "FIXED", amount: 10 }, null), 10);
});

test("예정 출금: 유료 식당 수 방식은 그 달 곳 수를 곱해 합계에 들어간다", () => {
  const items = [item({ amount: 100_000 }), item({ id: "i2", name: "식사권", method: "PER_PAID_STORE", amount: 3_000 })];
  const rows = dueRows(items, [], "2026-11", "2026-11-01", 12);
  assert.deepEqual(rows.map((r) => [r.item.id, r.amount, r.count]), [["i1", 100_000, null], ["i2", 36_000, 12]]);
  assert.deepEqual(dueTotals(rows), { amount: 136_000, unknown: 0 });
});

test("예정 출금: 식당 수를 못 읽으면 곱하는 항목만 모름으로 세고 합계에서 뺀다", () => {
  const items = [item({ amount: 100_000 }), item({ id: "i2", method: "PER_PAID_STORE", amount: 3_000 })];
  const rows = dueRows(items, [], "2026-11", "2026-11-01", null);
  assert.deepEqual(dueTotals(rows), { amount: 100_000, unknown: 1 });
});

test("항목 검사: 출금 방식은 둘 중 하나, 안 주면 고정 금액", () => {
  const d = checkItem({ name: "툴", start_period: "2026-11" }, false);
  assert.ok(d.ok && d.value.method === "FIXED");
  const p = checkItem({ name: "툴", start_period: "2026-11", method: "PER_PAID_STORE", amount: 3000 }, false);
  assert.ok(p.ok && p.value.method === "PER_PAID_STORE");
  assert.equal(checkItem({ name: "툴", start_period: "2026-11", method: "PER_STORE" }, false).ok, false);
  assert.equal(checkItem({ method: "NOPE" }, true).ok, false);
  // 부분 수정에서 방식을 안 보내면 건드리지 않는다
  const only = checkItem({ amount: 10 }, true);
  assert.ok(only.ok && !("method" in only.value));
});

/* ═══════════ 재무장표 (1121) ═══════════ */

const inc = (paid_on: string, amount: number | null, tax: number | null = null): IncomeEntry => ({ id: paid_on + amount, paid_on, amount, supply: amount === null ? null : amount - (tax ?? 0), tax, source: "invoice", name: "a", detail: null });
const bal = (o: Partial<AccountBalance>): AccountBalance => ({ id: "b", account_name: "운영", last4: "1234", amount: 0, as_of: "2026-10-31", period: "2026-10", reconciled: false, reconciled_by: null, reconciled_at: null, memo: null, updated_by: null, updated_at: null, ...o });
const fund = (o: Partial<FundingEvent>): FundingEvent => ({ id: "f", kind: "GRANT", status: "RECEIVED", name: "지원금", amount: 1_000, expected_on: null, received_on: "2026-10-05", restricted: true, restricted_left: null, spend_deadline: null, memo: null, updated_by: null, updated_at: null, ...o });

test("입금: 세금계산서는 공급가 · 세액을 나눠 싣고, 스팟은 세액을 모른다", () => {
  const i = invoiceIncome([{ id: "1", name: "a", title: "t", supply: 30_000, tax: 3_000, total: 33_000, status: "ISSUED", paid_at: "2026-11-03" } as unknown as TaxInvoice]);
  assert.deepEqual([i[0].amount, i[0].supply, i[0].tax], [33_000, 30_000, 3_000]);
  const s = spotIncome([{ id: "s", name: "x", price: 100_000, paid_at: "2026-11-02" } as unknown as SpotJob]);
  assert.deepEqual([s[0].supply, s[0].tax], [100_000, null]);
});

test("MRR: 발행 · 입금된 계산서의 공급가를 귀속 달에 펴고, 취소 · 품의는 뺀다", () => {
  const inv = (id: string, status: string, period: string, months: number, supply: number, paid_at: string | null = null) => ({ id, restaurant_id: 1, status, period, months, supply, paid_at }) as unknown as TaxInvoice;
  const lines = billingLines([inv("1", "ISSUED", "2026-11", 1, 45_000), inv("2", "ISSUED", "2026-10", 3, 90_000), inv("3", "CANCELED", "2026-11", 1, 99_000, "2026-11-01"), inv("4", "PENDING", "2026-11", 1, 77_000)]);
  assert.equal(mrrOf(lines, "2026-11"), 45_000 + 30_000);
  assert.equal(mrrOf(lines, "2027-01"), 0);
});

test("부가세 예수금: 이번 반기 세액 합, 1월 · 7월은 직전 반기까지, 세액 모르는 입금은 따로 센다", () => {
  const income = [inc("2026-06-10", 11_000, 1_000), inc("2026-07-03", 22_000, 2_000), inc("2026-11-01", 33_000, 3_000), { ...inc("2026-11-02", 5_000), tax: null }];
  const nov = vatPayable(income, "2026-11");
  assert.deepEqual([nov.amount, nov.unknown, nov.due], [5_000, 1, "2027-01-25"]);
  const jul = vatPayable(income, "2026-07");
  assert.deepEqual([jul.amount, jul.from, jul.due], [3_000, "2026-01", "2026-07-25"]);
});

test("순번: 기록 있는 마감월만 평균, 조달은 입금 내역에 없어 빠진다, 운영 번은 일회성 항목만 제외", () => {
  const items = [item({ id: "one", behavior: "ONE_OFF" }), item({ id: "fix", behavior: "FIXED" })];
  const out = [entry({ item_id: "fix", paid_on: "2026-09-10", amount: 300 }), entry({ id: "2", item_id: null, paid_on: "2026-10-10", amount: 300 }), entry({ id: "3", item_id: "one", paid_on: "2026-10-11", amount: 600 })];
  const income = [inc("2026-10-20", 100)];
  const b3 = burnSummary(income, out, items, "2026-10", 3);
  // 8월은 기록이 없어 평균에서 뺀다: 9월 순번 300, 10월 900 − 100 = 800
  assert.deepEqual([b3.months, b3.net, b3.gross, b3.operating, b3.lastNet], [["2026-09", "2026-10"], 550, 600, 250, 800]);
  const none = burnSummary([], [], [], "2026-10", 3);
  assert.equal(none.net, null);
});

test("런웨이: 가용 ÷ 순번, 소진월은 올림, 순번 ≤ 0 이면 흑자, 경보 색 12 · 6", () => {
  const r = runwayOf(17_800, 1_000, "2027-03");
  assert.ok(!r.surplus && r.zeroMonth === "2028-09" && r.tone === "green");
  const a = runwayOf(8_000, 1_000, "2026-10");
  assert.ok(!a.surplus && a.tone === "amber");
  const red = runwayOf(-500, 1_000, "2026-10");
  assert.ok(!red.surplus && red.months === 0 && red.tone === "red");
  assert.deepEqual(runwayOf(1_000, 0, "2026-10"), { surplus: true });
});

test("잔고: 계좌마다 그 달 가장 늦은 기준일, 최근 달 찾기, 대사 차이 1만 원 넘으면 대사 필요", () => {
  const list = [bal({ id: "1", amount: 1_000_000, as_of: "2026-09-30", period: "2026-09" }), bal({ id: "2", amount: 900_000, as_of: "2026-10-15" }), bal({ id: "3", amount: 950_000, as_of: "2026-10-31" }), bal({ id: "4", account_name: "예비", last4: null, amount: 50_000 })];
  const oct = balancesIn(list, "2026-10")!;
  assert.equal(oct.total, 1_000_000);
  assert.equal(latestBalances(list, "2026-11")?.period, "2026-10");
  assert.equal(latestBalances(list, "2026-08"), null);
  // 9월 말 100만 + 입금 20만 − 출금 30만 + 조달 0 = 90만 → 적은 100만과 10만 차이
  const r = reconcile(oct, list, [inc("2026-10-02", 200_000)], [entry({ paid_on: "2026-10-03", amount: 300_000 })], []);
  assert.ok(r.state === "need" && r.diff === 100_000);
  const ok = reconcile(oct, list, [inc("2026-10-02", 200_000)], [entry({ paid_on: "2026-10-03", amount: 300_000 })], [fund({ restricted: false, amount: 95_000 })]);
  assert.equal(ok.state, "ok");
  assert.equal(reconcile(balancesIn(list, "2026-09")!, list, [], [], []).state, "none");
});

test("지원금 전용 잔액: 입금된 전용 조달만, 남은 잔액을 모르면 금액 전체", () => {
  const f = [fund({}), fund({ id: "2", restricted_left: 300 }), fund({ id: "3", status: "CONFIRMED" }), fund({ id: "4", restricted: false }), fund({ id: "5", received_on: "2026-12-01" })];
  assert.equal(restrictedLeft(f, "2026-10"), 1_300);
});

test("항목 검사: 행동 방식 · 회계 위치는 정해진 값이거나 미분류(null)", () => {
  const ok = checkItem({ name: "툴", start_period: "2026-11", behavior: "VARIABLE", account: "S&M" }, false);
  assert.ok(ok.ok && ok.value.behavior === "VARIABLE" && ok.value.account === "S&M");
  const blank = checkItem({ name: "툴", start_period: "2026-11" }, false);
  assert.ok(blank.ok && blank.value.behavior === null && blank.value.account === null);
  assert.equal(checkItem({ behavior: "SOMETIMES" }, true).ok, false);
  assert.equal(checkItem({ account: "OPEX" }, true).ok, false);
});

test("기본 항목은 04절 기준표대로 태그가 붙어 있다 — 식사권 = 변동 · S&M", () => {
  const meal = DEFAULT_ITEMS.find((d) => d.key === "default:meal-voucher")!;
  assert.deepEqual([meal.behavior, meal.account], ["VARIABLE", "S&M"]);
  for (const d of DEFAULT_ITEMS) assert.ok(d.behavior && d.account, d.key ?? "");
});

test("잔고 · 조달 검사", () => {
  const today = "2026-11-21";
  const b = checkBalance({ account_name: "운영", last4: "1234", amount: 0, as_of: "2026-10-31" }, false, today);
  assert.ok(b.ok && b.value.amount === 0 && b.value.period === "2026-10");
  assert.equal(checkBalance({ account_name: "운영", last4: "12", amount: 1, as_of: "2026-10-31" }, false, today).ok, false);
  assert.equal(checkBalance({ account_name: "운영", amount: 1, as_of: "2026-11-30" }, false, today).ok, false, "미래 기준일");
  assert.equal(checkBalance({ account_name: "운영", amount: "", as_of: "2026-10-31" }, false, today).ok, false, "잔고 모름은 받지 않는다");
  const f = checkFunding({ kind: "SAFE", name: "시드", amount: "" }, false, today);
  assert.ok(f.ok && f.value.status === "PLANNED" && f.value.amount === null);
  assert.equal(checkFunding({ kind: "VC", name: "x" }, false, today).ok, false);
  assert.equal(checkFundingWhole({ status: "RECEIVED", amount: null }), "입금된 조달은 금액이 있어야 합니다.");
  assert.equal(checkFundingWhole({ status: "RECEIVED", amount: 10, received_on: "2026-11-01", restricted_left: 20 }), "남은 전용 잔액이 조달 금액보다 큽니다.");
  assert.equal(checkFundingWhole({ status: "RECEIVED", amount: 10, received_on: "2026-11-01" }), null);
});
