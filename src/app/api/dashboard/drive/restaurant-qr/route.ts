import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import {
  buildRestaurantQrGuideHtml,
  normalizeQrRestaurants,
  restaurantQrLink,
  type QrRestaurant,
} from "@/lib/restaurantQr";

/**
 * Drive 매장 QR. 앱 식당 탭과 같은 목록(is_affiliate · 앱 노출)을 매번 새로 받는다.
 *   GET                 → { restaurants: [{ restaurant_id, name, campus }] }
 *   GET ?format=html    → 마케팅 안내문 HTML 다운로드(QR 이미지 포함)
 */
// Koyeb 가 연달아 부르면 503 을 섞어 돌려줘서 몇 번 다시 받는다.
async function loadRestaurants(): Promise<QrRestaurant[]> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1000 * attempt));
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/affiliate-restaurants/`, {
      cache: "no-store",
    });
    if (res.ok) return normalizeQrRestaurants(await res.json());
    lastStatus = res.status;
    if (res.status < 500) break;
  }
  throw new Error(`affiliate-restaurants ${lastStatus}`);
}

export async function GET(req: NextRequest) {
  let restaurants: QrRestaurant[];
  try {
    restaurants = await loadRestaurants();
  } catch {
    return NextResponse.json({ detail: "매장 목록을 불러오지 못했습니다." }, { status: 502 });
  }

  if (req.nextUrl.searchParams.get("format") !== "html") {
    return NextResponse.json({ restaurants });
  }

  const qrSvg: Record<number, string> = {};
  await Promise.all(
    restaurants.map(async (r) => {
      qrSvg[r.restaurant_id] = await QRCode.toString(restaurantQrLink(r.restaurant_id), {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 4,
      });
    }),
  );
  const html = buildRestaurantQrGuideHtml(restaurants, { qrSvg });
  const filename = "매장_테이블_QR_안내.html";
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="restaurant_qr_guide.html"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
