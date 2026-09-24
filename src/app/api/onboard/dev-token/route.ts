import { NextRequest, NextResponse } from "next/server";
import { signOnboardToken } from "@/lib/onboard/token";

/**
 * 온보딩 화면 리허설용 토큰 — **개발 환경에서만.**
 *
 * 운영에서 링크를 만드는 길은 `/api/onboard/issue` 하나다. 그쪽은 매장 PIN 을 임시 PIN 으로
 * 갈아끼우므로 **살아 있는 매장에 쓰면 사장님이 못 들어간다.** 그래서 "화면만 보고 싶다"에는 못 쓴다.
 *
 * 여기는 서명만 한다 — PIN 을 건드리지 않고, 백엔드에 아무것도 쓰지 않는다.
 * `?preview=1` 과 짝을 이뤄 로그인 없이 단계별 화면을 확인하는 용도다.
 * `NODE_ENV !== "development"` 이면 404 — 운영 빌드에는 존재하지 않는 것과 같다.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ detail: "없는 주소입니다." }, { status: 404 });
  }
  const q = req.nextUrl.searchParams;
  const { token } = signOnboardToken({
    rid: Number(q.get("rid") ?? 999001),
    lid: null,
    name: q.get("name") ?? "리허설 식당",
    campus: q.get("campus") ?? "경북대",
    plan: (q.get("plan") as "FREE" | "BOOST" | "PREMIUM") ?? "BOOST",
    fee: Number(q.get("fee") ?? 50000),
    days: 1,
  });
  const origin = req.nextUrl.origin;
  return NextResponse.json({ token, url: `${origin}/onboard/${token}?preview=1` });
}
