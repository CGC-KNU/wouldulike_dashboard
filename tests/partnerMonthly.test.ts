import test from "node:test";
import assert from "node:assert/strict";
import * as vm from "node:vm";
import { buildPartnerMonthlyData, growth } from "../src/lib/draft/partnerMonthly";
import { fillPartnerTemplate, partnerMissing } from "../src/lib/draft/partnerTemplate";
import type { PartnerExposure } from "../src/lib/bigquery/partnerExposure";
import type { Bucket } from "../src/app/api/probe/insights/summary/route";

/**
 * 제휴 가게 사장님께 **공통으로** 나가는 월간 보고서.
 *
 * 여기서 잡아야 하는 것:
 *   ① 가게별 숫자가 섞이지 않는가 — 받는 사람마다 다른 말이 되면 안 된다.
 *   ② 못 읽은 칸을 0 으로 그리지 않는가 — 0 은 "아무 일도 없었다", 못 읽음은 "모른다"다.
 *   ③ 달마다 일수가 다른데 그대로 견주지 않는가(8월 31일 · 9월 30일).
 *   ④ 줄어든 달에 빨강을 칠하지 않는가 — 사장님께 약점을 말하지 않는다(0925).
 *   ⑤ 빈 종이가 나가지 않는가.
 */

const app = (o: Partial<PartnerExposure> = {}): PartnerExposure => ({
  window: { from: "2026-09-01", to: "2026-09-30", days: 30 },
  store_opens: 624, store_opens_per_day: 20.8, store_viewers: 142, stores_seen: 37,
  active_devices: 404, coupons_used: 30, coupon_users: 25, coupons_issued_organic: 120, stamps: 29,
  ...o,
});
const appAug = app({ window: { from: "2026-08-01", to: "2026-08-31", days: 31 },
  store_opens: 224, store_opens_per_day: 7.2, store_viewers: 39, stores_seen: 28,
  active_devices: 179, coupons_used: 3, coupon_users: 2, coupons_issued_organic: 81, stamps: 40 });

const ig = (o: Partial<Bucket> = {}): Bucket => ({
  period: "2026-09", posts: 12, pending_d7: 1,
  views: 84000, reach: 41000, saved: 620, shares: 310, likes: 2400, comments: 88, engagement: 3418, by_format: {}, ...o,
});

const build = (o: Partial<Parameters<typeof buildPartnerMonthlyData>[0]> = {}) =>
  buildPartnerMonthlyData({
    period: "2026-09", app: app(), appPrev: appAug, instagram: ig(),
    instagramPrev: ig({ period: "2026-08", posts: 9, reach: 22000, views: 39000, saved: 300, shares: 120 }),
    today: "2026-10-01", ...o,
  });

const cards = (d: ReturnType<typeof build>) =>
  (d.groups as { cards: { key: string; label: string; value: number | null; unit: string; change?: number | null; note: string; status?: string }[] }[])
    .flatMap((g) => g.cards);
const card = (d: ReturnType<typeof build>, key: string) => {
  const c = cards(d).find((x) => x.key === key);
  assert.ok(c, `${key} 칸이 없습니다`);
  return c!;
};

/** 최소 DOM 에서 양식의 렌더러를 그대로 돌린다 */
function render(html: string): { status: string; text: string } {
  const json = /<script type="application\/json" id="report-data">\n([\s\S]*?)\n<\/script>/.exec(html);
  assert.ok(json, "report-data 블록을 못 찾았습니다");
  const scripts = [...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)];
  assert.ok(scripts.length, "렌더러를 못 찾았습니다");
  const nodes: Record<string, { textContent?: string; innerHTML: string }> = {};
  for (const id of ["report-data", "err", "p-head", "p-kpi", "p-groups", "p-close", "p-foot"]) nodes[id] = { innerHTML: "" };
  nodes["report-data"].textContent = json[1];
  const attrs: Record<string, string> = {};
  const ctx: Record<string, unknown> = {
    document: { getElementById: (id: string) => nodes[id] ?? null, body: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } },
    console,
  };
  vm.createContext(ctx);
  new vm.Script(scripts[scripts.length - 1][1]).runInContext(ctx);
  const text = Object.values(nodes).map((x) => x.innerHTML).join(" ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { status: attrs["data-report-status"] ?? "ok", text };
}

test("앱과 인스타를 나란히 내되 섞지 않는다", () => {
  const d = build();
  assert.equal(card(d, "ig_reach").value, 41000);
  assert.equal(card(d, "ig_views").value, 84000);
  assert.equal(card(d, "coupons_used").value, 30);
  // 두 숫자를 더하거나 비율로 만든 칸이 없어야 한다 — 겹치는지조차 모른다
  for (const c of cards(d)) assert.ok(!/도달당|1인당|전환율/.test(c.label), `${c.label} — 앱과 인스타를 엮었다`);
});

test("가게별 숫자가 섞이지 않는다 — 공통 보고서다", () => {
  const r = render(fillPartnerTemplate(build()));
  assert.doesNotMatch(r.text, /사장님 가게가 \d/, "특정 가게 숫자를 쓰면 받는 사람마다 다른 말이 된다");
  assert.match(r.text, /우주라이크 전체의 기록/, "공통 보고서임을 밝힌다");
});

test("달마다 일수가 달라 가게 화면은 하루 평균으로 낸다", () => {
  const d = build();
  const c = card(d, "store_opens_per_day");
  assert.equal(c.value, 20.8, "624회 ÷ 30일");
  assert.equal(c.unit, "회/일");
  // 8월 224회÷31일 = 7.2 → 20.8/7.2 - 1 = +188.9%
  assert.equal(c.change, 188.9, "합계(624/224=+178.6%)가 아니라 하루 평균끼리 견준다");
});

test("못 읽은 칸은 0 이 아니라 비운다", () => {
  const d = build({ instagram: null, instagramPrev: null });
  const c = card(d, "ig_reach");
  assert.equal(c.value, null);
  assert.equal(c.status, "pending");
  const r = render(fillPartnerTemplate(d));
  assert.match(r.text, /이번 달은 세지 못했습니다/);
  assert.doesNotMatch(r.text, /게시물을 본 사람 0/, "0 으로 그리면 「아무도 안 봤다」로 읽힌다");
  assert.equal(r.status, "ok", "인스타가 없어도 앱 칸으로 보고서는 나간다");
});

test("전달이 없거나 0 이면 증감을 붙이지 않는다", () => {
  assert.equal(growth(30, 0), null, "0 으로 나눌 수 없다");
  assert.equal(growth(30, null), null);
  assert.equal(growth(null, 10), null);
  assert.equal(card(build({ appPrev: null }), "coupons_used").change, null);
});

test("줄어든 달에도 빨강을 쓰지 않는다 — 약점을 말하지 않는다(0925)", () => {
  const d = build({ app: app({ coupons_used: 1 }) });   // 3 → 1 로 줄었다
  assert.equal(card(d, "coupons_used").change, -66.7);
  const html = fillPartnerTemplate(d);
  const r = render(html);
  assert.match(r.text, /▼ 66.7%/, "줄어든 사실은 숨기지 않는다");
  // 양식이 쓰는 클래스로 본다 — 줄었을 때 쓰는 칩이 빨강이면 안 된다
  assert.match(html, /\.dn\{[^}]*color:var\(--sub\)/, "줄어든 칩은 회색이다");
  assert.doesNotMatch(html, /\.dn\{[^}]*#B91C1C/);
});

test("숫자가 하나도 없으면 빈 종이를 막는다", () => {
  const empty = build({ app: null, appPrev: null, instagram: null, instagramPrev: null });
  assert.deepEqual(partnerMissing(empty), ["숫자가 하나도 없습니다 — 이대로는 빈 종이가 나갑니다"]);
  assert.deepEqual(partnerMissing(build()), [], "값이 있으면 통과한다");
});

test("집계가 달 끝까지 못 갔으면 각주로 밝힌다", () => {
  const d = build({ through: "2026-09-29" });
  const r = render(fillPartnerTemplate(d));
  assert.match(r.text, /2026-09-29 까지만 집계돼 달 전체가 아닙니다/);
});

test("머리 숫자는 값이 있는 것만 고른다", () => {
  const r = render(fillPartnerTemplate(build({ instagram: null, instagramPrev: null })));
  assert.doesNotMatch(r.text, /게시물을 본 사람 —/, "값 없는 칸을 머리에 띄우지 않는다");
  assert.match(r.text, /가게 소개 화면 열람/);
});
