import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRestaurantQrGuideHtml,
  groupByCampus,
  normalizeQrRestaurants,
  restaurantQrLink,
} from "../src/lib/restaurantQr";

test("매장 QR 주소는 브릿지 + type=restaurant + 번호 + 인쇄물", () => {
  assert.equal(
    restaurantQrLink(317),
    "https://cgc-knu.github.io/wouldulike_deeplink/?type=restaurant&id=317&src=sticker",
  );
  assert.equal(
    restaurantQrLink(30, "poster"),
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
