import test from "node:test";
import assert from "node:assert/strict";
import * as vm from "node:vm";
import { buildStoreMonthlyData, storeMissing, storeSummary, type PartnerMonth, type StoreCard } from "../src/lib/draft/storeMonthly";
import { fillStoreMonthlyTemplate } from "../src/lib/draft/storeMonthlyTemplate";
import { downloadBar } from "../src/lib/draft/reportDownload";

/**
 * 가게 하나의 사장님 월간 보고서(1015, `/r/store/<rid>`).
 *
 * 여기서 잡아야 하는 것:
 *   ① 0 인 칸을 그리지 않는가 — 약점을 말하지 않는다(0925). 못 읽은 칸(null)도 0 으로 그리지 않는다.
 *   ② 스탬프를 안 쓰는 매장에 스탬프·재방문·단골이 안 나오는가 — 그 0 은 「안 쓰는 기능」이다.
 *   ③ 지난달을 % 없이 숫자만 나란히 두는가 — 한 자리 숫자라 2→4 가 +100% 가 된다.
 *   ④ 다른 가게·채널과 견주지 않는가.
 *   ⑤ 그 달 이야기가 없으면(누적 칸만 남으면) 내보내지 않는가.
 * 숫자는 지어낸 것이다(공개 저장소 — 실제 매장 숫자를 넣지 않는다).
 */

const db = (o: Partial<PartnerMonth> = {}, stats: Partial<PartnerMonth["stats"]> = {}): PartnerMonth => ({
  store: { restaurant_id: 1, name: "테스트가게", is_affiliate: true, hidden_from_app: false, stamp_enabled: true },
  period: "2026-09",
  complete: true,
  stats: { coupon_used: 5, stamp: 12, revisit: 3, ...stats },
  prev: { period: "2026-08", coupon_used: 2, stamp: 15, revisit: 0 },
  loyal_total: 4,
  wishlist_total: 7,
  ...o,
});

const build = (o: Partial<Parameters<typeof buildStoreMonthlyData>[0]> = {}) =>
  buildStoreMonthlyData({ period: "2026-09", db: db(), viewers: 42, viewersPrev: 30, today: "2026-10-02", ...o });

const cards = (d: ReturnType<typeof build>) => (d.groups as { key: string; cards: StoreCard[] }[]).flatMap((g) => g.cards);
const keys = (d: ReturnType<typeof build>) => cards(d).map((c) => c.key);
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
  for (const id of ["report-data", "err", "s-head", "s-kpi", "s-groups", "s-close", "s-foot"]) nodes[id] = { innerHTML: "" };
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

test("값이 있는 칸을 두 묶음으로 낸다 — 사장님 홈과 같은 이름·단위", () => {
  const d = build();
  assert.deepEqual(keys(d), ["viewers", "wishlist", "coupons", "stamps", "revisit", "loyal"]);
  assert.equal(card(d, "coupons").value, 5);
  assert.equal(card(d, "stamps").unit, "개", "스탬프는 개수다(사장님 홈과 같다)");
  assert.equal(card(d, "viewers").prev, 30);
  assert.equal(card(d, "coupons").prev, 2);
  assert.equal("prev" in card(d, "loyal"), false, "누적 칸에는 지난달을 붙이지 않는다");
  assert.equal("prev" in card(d, "wishlist"), false);
});

test("0 인 칸은 그리지 않는다 — 약점을 말하지 않는다(0925)", () => {
  const d = build({ viewers: 0, db: db({ wishlist_total: 0, loyal_total: 0 }, { revisit: 0 }) });
  assert.deepEqual(keys(d), ["coupons", "stamps"]);
  assert.deepEqual((d.groups as { key: string }[]).map((g) => g.key), ["visit"], "칸이 하나도 없는 묶음은 제목도 안 나온다");
  const r = render(fillStoreMonthlyTemplate(d));
  assert.doesNotMatch(r.text, /\b0\s*명/, "0명을 그리면 「아무도 없었다」로 읽힌다");
  assert.doesNotMatch(r.text, /가게 화면을 열어 본 학생/);
});

test("못 읽은 칸(null)도 0 으로 그리지 않고 뺀다", () => {
  const d = build({ viewers: null, viewersPrev: null, db: db({ wishlist_total: null }) });
  assert.ok(!keys(d).includes("viewers"));
  assert.ok(!keys(d).includes("wishlist"));
  const r = render(fillStoreMonthlyTemplate(d));
  assert.doesNotMatch(r.text, /기기/, "열람 칸이 없으면 기기 각주도 없다");
  assert.equal(r.status, "ok");
});

test("스탬프를 안 쓰는 매장은 스탬프·재방문·단골을 통째로 뺀다", () => {
  const off = db();
  off.store = { ...off.store, stamp_enabled: false };
  const d = build({ db: off });
  assert.deepEqual(keys(d), ["viewers", "wishlist", "coupons"]);
  assert.doesNotMatch(String(d.summary), /스탬프/);
  const r = render(fillStoreMonthlyTemplate(d));
  assert.doesNotMatch(r.text, /스탬프/, "인사·묶음 설명에도 스탬프가 안 나온다");
});

test("지난달은 % 없이 숫자만 나란히 — 줄었어도 화살표·빨강이 없다", () => {
  const html = fillStoreMonthlyTemplate(build());   // 스탬프 15 → 12 로 줄었다
  const r = render(html);
  assert.match(r.text, /8월 15개/, "지난달 숫자는 그대로 보인다");
  assert.match(r.text, /8월 2장/);
  assert.doesNotMatch(r.text, /%|▲|▼/);
  assert.doesNotMatch(html, /#B91C1C[^}]*\.pv|\.pv\{[^}]*#B91C1C/, "지난달 줄은 회색이다");
  assert.match(r.text, /8월 한 달 전체입니다/, "사장님 홈의 「지난달」(같은 날수)과 다르다고 밝힌다");
});

test("다른 가게·채널과 견주지 않는다", () => {
  const r = render(fillStoreMonthlyTemplate(build()));
  assert.doesNotMatch(r.text, /평균|중앙값|순위|상위|하위|다른 가게|가운데 값/);
});

test("머리 한 줄 — 있는 숫자만 문장으로", () => {
  assert.equal(storeSummary(9, { viewers: 42, coupons: 5, stamps: 12 }),
    "9월 한 달 동안 학생 42명이 앱에서 가게 화면을 열어 봤습니다. 쿠폰 5장이 가게에서 쓰였고, 스탬프 12개가 적립됐습니다.");
  assert.equal(storeSummary(9, { viewers: 42, coupons: 0, stamps: null }),
    "9월 한 달 동안 학생 42명이 앱에서 가게 화면을 열어 봤습니다.");
  assert.equal(storeSummary(9, { viewers: null, coupons: 1, stamps: 0 }), "9월 한 달 동안 쿠폰 1장이 가게에서 쓰였습니다.");
  assert.equal(storeSummary(9, { viewers: 1200, coupons: 0, stamps: 3 }),
    "9월 한 달 동안 학생 1,200명이 앱에서 가게 화면을 열어 봤습니다. 스탬프 3개가 적립됐습니다.");
  assert.equal(storeSummary(9, { viewers: 0, coupons: 0, stamps: 0 }), null);
});

test("그 달 이야기가 없으면 내보내지 않는다 — 찜·단골(누적)만으로는 안 된다", () => {
  const only = build({ viewers: 0, db: db({}, { coupon_used: 0, stamp: 0, revisit: 0 }) });
  assert.deepEqual(keys(only), ["wishlist", "loyal"]);
  assert.equal(storeMissing(only).length, 1);
  assert.match(storeMissing(only)[0], /빈 종이/);
  assert.deepEqual(storeMissing(build()), []);
});

test("머리 숫자는 그려진 칸 중 셋까지", () => {
  const r = render(fillStoreMonthlyTemplate(build({ viewers: 0 })));
  // 태그를 걷으면 숫자와 단위 사이가 띄어진다
  assert.match(r.text, /가게에서 쓰인 쿠폰 5 장 적립된 스탬프 12 개 다시 찾아온 학생 3 명 앱에서/);
  const html = fillStoreMonthlyTemplate(build());
  assert.match(render(html).text, /가게 화면을 열어 본 학생 42 명 가게에서 쓰인 쿠폰 5 장 적립된 스탬프 12 개 앱에서/);
});

test("칸이 하나뿐이면 머리 숫자를 띄우지 않는다 — 같은 숫자를 세 번 쓰지 않게", () => {
  const off = db({ wishlist_total: 0 }, { coupon_used: 0, stamp: 0, revisit: 0 });
  off.store = { ...off.store, stamp_enabled: false };
  const r = render(fillStoreMonthlyTemplate(build({ viewers: 17, db: off })));
  assert.equal(r.text.match(/17/g)?.length, 2, "머리 한 줄과 칸에만");
  assert.match(r.text, /앱에 남은 가게 기록을 정리해 드립니다/, "없는 칸(쿠폰)을 인사에서 말하지 않는다");
});

test("집계가 달 끝까지 못 갔으면 각주로 밝힌다", () => {
  const r = render(fillStoreMonthlyTemplate(build({ through: "2026-09-29" })));
  assert.match(r.text, /2026-09-29 까지만 집계돼 달 전체가 아닙니다/);
});

test("가게 이름이 비면 양식이 막는다", () => {
  const anon = db();
  anon.store = { ...anon.store, name: "" };
  const d = build({ db: anon });
  assert.ok(storeMissing(d).includes("가게 이름"));
  assert.equal(render(fillStoreMonthlyTemplate(d)).status, "error");
});

test("양식을 채워도 스타일이 남는다 — 주석 속 여는 태그에 정규식이 걸리지 않는다", () => {
  const html = fillStoreMonthlyTemplate(build());
  assert.match(html, /<style>[\s\S]*\.kpi\{/);
  assert.match(html, /"name": "테스트가게"/);
});

test("PNG 는 한 장 — 이 양식에는 게시물 리포트의 구획(r-*)이 없다", () => {
  const bar = downloadBar({ filename: "x", canDownload: true, statusLabel: "s", pages: [{ no: 1, ids: [] }] });
  assert.match(bar, /PNG 저장 \(1장\)/);
  assert.match(bar, /var PNG_SKIP = \[\];/);
  // 기본값(게시물 리포트)은 그대로 두 장
  assert.match(downloadBar({ filename: "x", canDownload: true, statusLabel: "s" }), /PNG 저장 \(2장\)/);
});
