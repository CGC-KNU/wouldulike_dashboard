import { test } from "node:test";
import assert from "node:assert/strict";
import { leadSignal, pickSpotLeads } from "../src/lib/spotLeads";
import type { IgSig, Store } from "../src/lib/hubble";

/** 스팟 제작 컨택 후보(1028) — 광고 흔적 있는 허블 매장, 스팟 건 있는 곳 빼고, 최근 협찬 먼저 */

const NOW = Date.parse("2026-11-02");
let n = 0;
const store = (name: string, sig?: IgSig): Store => ({
  id: `L${++n}`, k: "일", n: name, c: "한식", a: "대구 북구", t: "053-000-0000", o: "2020-01-01", y: 0, x: 0, d: 300, ch: null, dn: 1, g: "A", sc: 1,
  p: { indep: 1, dense: 1, dist: 1, new: 0 },
  ig: sig === undefined ? undefined : { handle: name, url: `https://instagram.com/${name}`, kind: "비즈니스", checked: "2026-11-01", sig },
});

test("sig 가 없으면(11/1 전) 후보가 없다", () => {
  assert.deepEqual(pickSpotLeads([{ campus: "경북대", stores: [store("옛가게"), store("빈값", {})] }], [], [], { now: NOW }), []);
});

test("협찬 · 이벤트 0 은 빠지고, 최근 협찬 → 오래된 협찬 → 이벤트만 순", () => {
  const stores = [
    store("이벤트만", { sponsor: 0, event: 3 }),
    store("옛협찬많음", { sponsor: 5, sponsor_last: "2026-03-01" }),
    store("최근협찬", { sponsor: 1, sponsor_last: "2026-10-20", engage: 5 }),
    store("최근협찬둘", { sponsor: 2, sponsor_last: "2026-10-01" }),
    store("흔적없음", { sponsor: 0, event: 0, engage: 99 }),
  ];
  const got = pickSpotLeads([{ campus: "경북대", stores }], [], [], { now: NOW }).map((l) => l.store.n);
  assert.deepEqual(got, ["최근협찬둘", "최근협찬", "옛협찬많음", "이벤트만"]);
});

test("이미 스팟 건이 있으면 뺀다 — 인허가 번호 · 이름 · 파트너 매장", () => {
  const a = store("서서맥주 경북대점", { sponsor: 1 });
  const b = store("후추식당", { sponsor: 1 });
  const c = store("파트너집", { event: 1 });
  const d = store("남는집", { event: 1 });
  const partners = [{ restaurant_id: 7, name: "파트너집", is_affiliate: true }];
  const spots = [{ name: "서서맥주", memo: null }, { name: "다른 이름", memo: `컨택 후보\n인허가 ${b.id}` }, { name: "파트너 건", restaurant_id: 7 }];
  const got = pickSpotLeads([{ campus: "경북대", stores: [a, b, c, d] }], partners, spots, { now: NOW });
  assert.deepEqual(got.map((l) => l.store.n), ["남는집"]);
});

test("파트너 매장이면 rid 를 붙이고, 상위 limit 곳만", () => {
  const stores = Array.from({ length: 30 }, (_, i) => store(`가게${i}`, { event: i + 1 }));
  stores.push(store("우리파트너", { sponsor: 1, sponsor_last: "2026-10-30" }));
  const got = pickSpotLeads([{ campus: "경북대", stores }], [{ restaurant_id: 3, name: "우리파트너", is_affiliate: true }], [], { now: NOW });
  assert.equal(got.length, 20);
  assert.equal(got[0].store.n, "우리파트너");
  assert.equal(got[0].rid, 3);
  assert.equal(got[1].rid, null);
});

test("광고 흔적 한 줄", () => {
  assert.equal(leadSignal(store("a", { sponsor: 2, sponsor_last: "2026-10-12", event: 1 })), "협찬 · 체험단 2편 (최근 10/12) · 이벤트 1편");
  assert.equal(leadSignal(store("b", { event: 2 })), "이벤트 2편");
});
