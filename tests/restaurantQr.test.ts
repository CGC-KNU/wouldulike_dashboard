import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRestaurantQrGuideHtml,
  groupByCampus,
  legacyBridgeLink,
  normalizeQrRestaurants,
  restaurantQrLink,
  webStampLink,
} from "../src/lib/restaurantQr";

test("웹 스탬프 QR 주소는 /s/{번호}?src=", () => {
  assert.equal(webStampLink("https://stamp.example.com/", 317), "https://stamp.example.com/s/317?src=sticker");
  assert.equal(webStampLink("https://stamp.example.com", 30, "poster"), "https://stamp.example.com/s/30?src=poster");
});

test("전환일(12/1 KST) 전에는 기존 브릿지, 이후에는 웹 주소", () => {
  process.env.NEXT_PUBLIC_STAMP_WEB_BASE = "https://stamp.example.com";
  try {
    const before = new Date("2026-11-30T14:59:59Z"); // 11/30 23:59:59 KST
    const after = new Date("2026-11-30T15:00:00Z"); // 12/01 00:00 KST
    assert.equal(restaurantQrLink(317, "sticker", before), legacyBridgeLink(317));
    assert.equal(restaurantQrLink(317, "sticker", after), "https://stamp.example.com/s/317?src=sticker");
  } finally {
    delete process.env.NEXT_PUBLIC_STAMP_WEB_BASE;
  }
});

test("웹 주소가 없으면 전환일이 지나도 기존 브릿지", () => {
  assert.equal(restaurantQrLink(317, "sticker", new Date("2027-01-01T00:00:00Z")), legacyBridgeLink(317));
});

test("기존 브릿지 주소는 type=restaurant + type=restaurant + 번호 + 인쇄물", () => {
  assert.equal(
    legacyBridgeLink(317),
    "https://cgc-knu.github.io/wouldulike_deeplink/?type=restaurant&id=317&src=sticker",
  );
  assert.equal(
    legacyBridgeLink(30, "poster"),
    "https://cgc-knu.github.io/wouldulike_deeplink/?type=restaurant&id=30&src=poster",
  );
});

test("백엔드 응답에서 번호 없는 행과 중복을 뺀다", () => {
  const list = normalizeQrRestaurants({
    restaurants: [
      { restaurant_id: 317, name: " 라라더 ", campus: "경북대" },
      { restaurant_id: 317, name: "라라더", campus: "경북대" },
      { restaurant_id: null, name: "번호없음" },
      { restaurant_id: 352, name: "군침", campus: null },
    ],
  });
  assert.deepEqual(list, [
    { restaurant_id: 317, name: "라라더", campus: "경북대" },
    { restaurant_id: 352, name: "군침", campus: "기타" },
  ]);
});

test("대학가 순서는 경북대·계명대·영남대·그 외, 안에서는 이름순", () => {
  const groups = groupByCampus([
    { restaurant_id: 1, name: "파랑해", campus: "계명대" },
    { restaurant_id: 2, name: "김빠포", campus: "영남대" },
    { restaurant_id: 3, name: "웃찌커피", campus: "경북대" },
    { restaurant_id: 4, name: "고니식탁", campus: "경북대" },
    { restaurant_id: 5, name: "새매장", campus: "기타" },
  ]);
  assert.deepEqual(groups.map((g) => g.campus), ["경북대", "계명대", "영남대", "기타"]);
  assert.deepEqual(groups[0].restaurants.map((r) => r.name), ["고니식탁", "웃찌커피"]);
});

test("안내문에 매장마다 주소가 들어가고 이름은 이스케이프된다", () => {
  const html = buildRestaurantQrGuideHtml(
    [
      { restaurant_id: 317, name: "라라더", campus: "경북대" },
      { restaurant_id: 900, name: "A&B <신규>", campus: "계명대" },
    ],
    { generatedAt: new Date("2026-10-18T09:00:00Z") },
  );
  assert.match(html, /기준: 2026-10-18 · 앱 식당 탭에 나오는 제휴 매장 2곳 \(경북대 1, 계명대 1\)/);
  assert.match(html, /id=900&amp;src=sticker/);
  assert.match(html, /A&amp;B &lt;신규&gt;/);
});
