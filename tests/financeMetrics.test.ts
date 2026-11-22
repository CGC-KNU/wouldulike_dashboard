import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetVsActual, bvaTone, cacOf, campusRows, conversionRate, defaultAlive, funnelOf, itemCost, marketRecount, milestonePeriod, newPaidCount, nextMilestone, nrrOf, onboardingCost, paybackMonths, retention3, unitEconomics, vatNet } from "../src/lib/finance/metrics";
import { checkEntry, checkSettings } from "../src/lib/finance/validate";
import type { BillingLine, ChurnRow, ExpenseEntry, ExpenseItem, IncomeEntry, PaidStore, PlanDoc } from "../src/lib/finance/types";

/** 재무 지표 20개(1122) — 순수 산식. 모르는 값은 0 이 아니라 null. */

const item = (o: Partial<ExpenseItem> = {}): ExpenseItem => ({
  id: "i1", key: null, name: "식사권", category: "식사권", method: "FIXED", amount: 100_000, cycle: "MONTHLY", pay_day: 10,
  start_period: "2026-01", end_period: null, behavior: null, account: null, active: true, is_default: false, memo: null, updated_by: null, updated_at: null, ...o,
});
const entry = (o: Partial<ExpenseEntry> = {}): ExpenseEntry => ({
  id: "e1", item_id: null, paid_on: "2026-10-10", period: "2026-10", name: "x", category: "기타", amount: 100_000, memo: null, created_by: null, created_at: null, ...o,
});
const bill = (rid: number, period: string, supply: number, months = 1): BillingLine => ({ id: `${rid}${period}`, restaurant_id: rid, period, months, supply });
const store = (id: number, start: string | null, campus: string | null = "경북대"): PaidStore => ({ id, name: `매장${id}`, start, campus });
const M3 = ["2026-08", "2026-09", "2026-10"];

test("매장 1곳 단위: 3개월 합산 ARPA · 변동비 · 공헌이익 · 손익분기 — 기록이 있으면 기록, 없으면 항목 금액", () => {
  const stores = [store(1, "2026-01"), store(2, "2026-01")];
  const billing = [bill(1, "2026-08", 135_000, 3), bill(2, "2026-08", 135_000, 3)]; // 석 달치 계산서는 달마다 나눠 편다
  const items = [
    item({ id: "v", behavior: "VARIABLE", method: "PER_PAID_STORE", amount: 5_000 }),
    item({ id: "f", behavior: "FIXED", amount: 900_000 }),
    item({ id: "c", behavior: "SEMI_VARIABLE", account: "COGS", amount: 30_000 }),
  ];
  // 10월 변동 항목은 기록이 있다(실제 12,000) — 항목 금액(5,000 × 2) 대신 기록을 쓴다
  const entries = [entry({ item_id: "v", period: "2026-10", amount: 12_000 })];
  const ue = unitEconomics(billing, items, entries, stores, M3);
  assert.equal(ue.storeMonths, 6);
  assert.equal(ue.arpa, 45_000);
  assert.equal(ue.variablePerStore, Math.round((10_000 + 10_000 + 12_000) / 6));
  assert.equal(ue.contribution, 45_000 - 5_333);
  assert.equal(ue.fixed, 930_000);
  assert.equal(ue.breakEven, Math.ceil(930_000 / (45_000 - 5_333)));
  assert.equal(ue.grossMargin, (270_000 - 90_000) / 270_000);
});

test("매장 1곳 단위: 유료 매장을 못 읽으면 매장당 값은 null, 금액 없는 항목은 0 이 아니라 미입력으로 센다", () => {
  const ue = unitEconomics([], [item({ behavior: "VARIABLE", amount: null })], [], null, M3);
  assert.equal(ue.arpa, null);
  assert.equal(ue.contribution, null);
  assert.equal(ue.breakEven, null);
  assert.equal(itemCost([item({ behavior: "VARIABLE", amount: null })], [], "2026-10", 3, (i) => i.behavior === "VARIABLE").unknown, 1);
});

test("신규 유료 · 입점 비용: 해지한 유료 매장도 시작 월로 센다, 입점 태그가 없으면 기록 시작 전", () => {
  const churn: ChurnRow[] = [{ restaurant_id: 9, ended_on: "2026-10-20", reason: "CLOSED", start: "2026-09", tier: "BOOST" }, { restaurant_id: 8, ended_on: "2026-10-20", reason: "VOLUNTARY", start: "2026-09", tier: "FREE" }];
  assert.equal(newPaidCount([store(1, "2026-08"), store(2, "2026-01")], churn, M3), 2);
  assert.equal(newPaidCount(null, churn, M3), null);
  assert.deepEqual(onboardingCost([entry()], M3, 2), { total: 0, started: false, perStore: null });
  assert.equal(onboardingCost([entry({ tag: "onboarding", amount: 300_000 }), entry({ tag: "onboarding", paid_on: "2026-05-01", amount: 1 })], M3, 2).perStore, 150_000);
});

test("CAC: 후보에 쓴 시간 × 단가 + S&M(식사권 같은 변동 제외) ÷ 신규 유료, 시간 기록 전이면 null", () => {
  const items = [item({ id: "ad", account: "S&M", behavior: "ONE_OFF" }), item({ id: "meal", account: "S&M", behavior: "VARIABLE" })];
  const entries = [entry({ item_id: "ad", amount: 200_000 }), entry({ item_id: "meal", amount: 999_999 }), entry({ category: "마케팅·협찬", amount: 50_000 }), entry({ category: "마케팅·협찬", tag: "campus", campus: "영남대", amount: 7 })];
  const mins = { "2026-10": { lead: 600, store: 300 } };
  const r = cacOf(entries, items, mins, "2026-10-01", 10_000, M3, 2);
  assert.equal(r.people, 100_000);
  assert.equal(r.sm, 250_000);
  assert.equal(r.cac, 175_000);
  assert.equal(cacOf(entries, items, {}, null, 10_000, M3, 2).cac, null);
  assert.equal(cacOf(entries, items, mins, "2026-10-01", 10_000, M3, 0).cac, null);
  assert.equal(paybackMonths(175_000, 45_000, 0.5), 175_000 / 22_500);
  assert.equal(paybackMonths(175_000, 45_000, null), null);
});

test("3개월 유지율: 시작 후 3개월 안에 해지한 유료 매장만 떠난 것으로 센다", () => {
  const churn: ChurnRow[] = [
    { restaurant_id: 5, ended_on: "2026-05-20", reason: "CLOSED", start: "2026-04", tier: "BOOST" },     // 1개월 만에 해지 → 떠남
    { restaurant_id: 6, ended_on: "2026-09-01", reason: "VOLUNTARY", start: "2026-03", tier: "CONTENT" }, // 6개월 뒤 해지 → 3개월 유지
  ];
  const r = retention3([store(1, "2026-05"), store(2, "2026-12"), store(3, null)], churn, "2026-10");
  assert.equal(r.from, "2026-02");
  assert.equal(r.to, "2026-07");
  assert.equal(r.started, 3);
  assert.equal(r.retained, 2);
  assert.equal(retention3(null, churn, "2026-10").rate, null);
});

test("전환율 · NRR · 깔때기", () => {
  const hist = [{ restaurant_id: 1, from: "FREE", to: "BOOST", at: "2026-10-03T00:00:00Z" }, { restaurant_id: 2, from: null, to: "BOOST", at: "2026-10-04T00:00:00Z" }, { restaurant_id: 3, from: "FREE", to: "CONTENT", at: "2026-06-01T00:00:00Z" }];
  const c = conversionRate(hist, 9, M3);
  assert.equal(c.converted, 1);
  assert.equal(c.rate, 0.1);
  assert.equal(c.since, "2026-06-01");
  assert.equal(conversionRate([], 9, M3).rate, null);

  const billing = [bill(1, "2026-07", 30_000), bill(2, "2026-07", 30_000), bill(1, "2026-10", 50_000), bill(3, "2026-10", 45_000)];
  const n = nrrOf(billing, "2026-10", 3);
  assert.equal(n.base, "2026-07");
  assert.equal(n.cohort, 2);
  assert.equal(n.rate, 50_000 / 60_000); // 1번은 업셀, 2번(쉼)은 0, 3번(새 매장)은 뺀다

  assert.deepEqual(funnelOf({ 미컨택: 10, "컨택 중": 15, "계약 완료": 5 }), { contacted: 20, contracted: 5, rate: 0.25, perDeal: 4 });
  assert.equal(funnelOf(null), null);
});

test("마일스톤 열 읽기 · 다음 마일스톤", () => {
  assert.equal(milestonePeriod("지금 · 11-20"), null);
  assert.equal(milestonePeriod("26.12"), "2026-12");
  assert.equal(milestonePeriod("27-1 · 6월 말"), "2027-06");
  assert.equal(milestonePeriod("27-2"), "2027-12");
  assert.equal(milestonePeriod("메모"), null);
  const goals = { columns: ["지금 · 11-20", "26.12", "27-1 · 6월 말"], focus: 2, rows: [] };
  assert.deepEqual(nextMilestone(goals, "2026-11"), { label: "26.12", period: "2026-12" });
  assert.deepEqual(nextMilestone(goals, "2026-12"), { label: "27-1 · 6월 말", period: "2027-06" });
  assert.equal(nextMilestone(null, "2026-11"), null);
});

test("Default alive: MRR 3개월 성장률이 이어질 때 소진 전에 월 비용을 넘는가", () => {
  const billing = [bill(1, "2026-07", 1_000_000), bill(1, "2026-10", 1_331_000)]; // 월 10% 성장
  const a = defaultAlive(billing, "2026-10", 1_771_561, 6); // 3개월 뒤 흑자, 런웨이 6개월
  assert.ok(Math.abs((a.growth ?? 0) - 0.1) < 1e-9);
  assert.equal(a.profitMonth, "2027-01");
  assert.equal(a.alive, true);
  assert.equal(defaultAlive(billing, "2026-10", 1_771_561, 2).alive, false);
  assert.equal(defaultAlive(billing, "2026-10", 1_000_000, 3).alive, true); // 이미 MRR ≥ 비용
  assert.equal(defaultAlive(billing, "2026-10", null, 3).alive, null);
  assert.equal(defaultAlive([bill(1, "2026-10", 500)], "2026-10", 1_000, 3).alive, false); // 성장률을 못 내면 흑자 못 감
});

test("계획 대비 실적: 계정별 차이 · 10만 원 미만 무시 · ±10% 노랑 · ±20% 빨강", () => {
  assert.equal(bvaTone(1_000_000, 1_050_000), "small");
  assert.equal(bvaTone(1_000_000, 1_150_000), "amber");
  assert.equal(bvaTone(1_000_000, 750_000), "red");
  assert.equal(bvaTone(10_000_000, 10_500_000), "ok");
  const plan: PlanDoc = { months: [{ period: "2027-01", revenue: 1_000_000, cost: { FIXED: 3_950_000, VARIABLE: 150_000, ONE_OFF: 7_000_000 } }] };
  const income: IncomeEntry[] = [{ id: "a", paid_on: "2027-01-05", amount: 880_000, supply: 800_000, tax: 80_000, source: "invoice", name: "a", detail: null }];
  const items = [item({ id: "f", behavior: "FIXED" })];
  const entries = [entry({ item_id: "f", paid_on: "2027-01-10", amount: 4_000_000 }), entry({ paid_on: "2027-01-11", amount: 300_000 }), entry({ paid_on: "2027-01-12", tag: "onboarding", amount: 200_000 })];
  const r = budgetVsActual(plan, income, entries, items, "2027-01");
  const by = Object.fromEntries(r.rows.map((x) => [x.key, x]));
  assert.equal(by.revenue.actual, 800_000);
  assert.equal(by.revenue.tone, "red");
  assert.equal(by.FIXED.tone, "small");
  assert.equal(by.ONE_OFF.actual, 200_000);
  assert.equal(by.SEMI_VARIABLE.plan, null);
  assert.equal(by.UNTAGGED.actual, 300_000);
  assert.deepEqual(budgetVsActual(plan, income, entries, items, "2026-11"), { rows: [], planned: false, first: "2027-01" });
  assert.equal(budgetVsActual(null, income, entries, items, "2027-01").planned, false);
});

test("부가세 순납부: 받은 세액 − 매입 세액, 세액 안 적은 출금은 건수로", () => {
  const income: IncomeEntry[] = [{ id: "a", paid_on: "2026-08-05", amount: 330_000, supply: 300_000, tax: 30_000, source: "invoice", name: "a", detail: null }];
  const entries = [entry({ paid_on: "2026-09-01", tax: 9_000 }), entry({ paid_on: "2026-09-02" }), entry({ paid_on: "2026-05-02", tax: 99 })];
  assert.deepEqual(vatNet(income, entries, "2026-10"), { out: 30_000, input: 9_000, net: 21_000, missing: 1, recorded: 1, unknownIn: 0, due: "2027-01-25" });
});

test("상권: 침투율 · 진입 비용 회수기간 · 허블 재계산", () => {
  const hub = { campuses: [{ campus: "경북대", n: 1000 }], total: 75_903, count: 180, bySido: { 대구광역시: 3000, 경상북도: 2000, 서울특별시: 9000 } };
  const rows = campusRows([store(1, null), store(2, null), store(3, null, "영남대")], [{ id: 4, campus: "경북대" }], hub, [entry({ tag: "campus", campus: "경북대", amount: 2_000_000 })], 40_000, ["경북대", "영남대"]);
  assert.deepEqual(rows[0], { campus: "경북대", paid: 2, partners: 3, restaurants: 1000, paidRate: 0.002, partnerRate: 0.003, entryCost: 2_000_000, entryPayback: 25 });
  assert.equal(rows[1].restaurants, null);
  assert.equal(rows[1].paidRate, null);
  const m = marketRecount({ boost_annual: 594_000, sam_sidos: ["대구", "경상북도"] }, hub);
  assert.equal(m.tam, 75_903 * 594_000);
  assert.equal(m.samRestaurants, 5000);
  assert.equal(marketRecount(null, hub).tam, null);
});

test("입력 검사: 출금 세액 · 태그 · 설정", () => {
  const base = { paid_on: "2026-11-01", name: "키트", category: "제작", amount: 110_000 };
  const ok = checkEntry({ ...base, tax: "10,000", tag: "onboarding", store_id: "7" }, false, "2026-11-22");
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual([ok.value.tax, ok.value.tag, ok.value.store_id], [10_000, "onboarding", 7]);
  assert.equal(checkEntry({ ...base, tax: 200_000 }, false, "2026-11-22").ok, false);
  assert.equal(checkEntry({ ...base, tag: "campus" }, false, "2026-11-22").ok, false);
  assert.equal(checkEntry({ ...base, tag: "campus", campus: "서울대" }, false, "2026-11-22").ok, false);
  assert.equal(checkEntry({ ...base, tag: "x" }, false, "2026-11-22").ok, false);
  assert.equal(checkEntry({ ...base, tag: null, store_id: 3 }, false, "2026-11-22").ok, false);
  assert.ok(checkEntry({ amount: 5_000 }, true, "2026-11-22").ok);
  assert.deepEqual(checkSettings({ hour_rate: "15,000" }), { ok: true, value: { hour_rate: 15_000 } });
  assert.equal(checkSettings({ hour_rate: 2_000_000 }).ok, false);
  assert.equal(checkSettings({}).ok, false);
});

test("매장 1곳 단위: 청구가 없거나 걸리는 변동 항목이 없으면 0원이 아니라 모름", () => {
  const ue = unitEconomics([], [item({ behavior: "VARIABLE", start_period: "2026-11" })], [], [store(1, "2026-01")], M3);
  assert.equal(ue.storeMonths, 3);
  assert.equal(ue.arpa, null);
  assert.equal(ue.variablePerStore, null);
});
