import { NextRequest, NextResponse } from "next/server";
import { requireTool } from "@/lib/draft/guard";
import { readStorePin } from "@/lib/onboard/pinRead";

/**
 * 발급 화면용 — 이 매장 PIN 이 **누구 것인가** (0929).
 *
 * 전에는 화면이 "PIN 이 있다/없다" 만 알아서, 링크를 발급할 때 **우리가 자동으로 심은 임시 PIN** 까지
 * "이 매장은 이미 매장 PIN 이 있습니다" 라는 빨간 경고로 띄웠다. 수연님 실측(일공초밥): PIN 을 정한 적도
 * 없는데 경고가 떠서 멈췄다. 값은 돌려주지 않는다 — 누구 것인지만.
 *
 *   none        PIN 없음 — 발급하면 임시 PIN 이 심긴다
 *   temp        우리가 심은 임시 PIN — 전에 링크를 낸 적 있음. 다시 내도 같은 값이다
 *   owner       사장님이 정한 PIN — 그대로 두고 링크만 낸다 (사장님은 그 PIN 으로 들어온다)
 *   unreadable  걸려 있지만 못 읽는 줄(0925~0928) — 다시 내면 임시 PIN 으로 바뀐다
 */
export async function GET(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const rid = Number(req.nextUrl.searchParams.get("rid"));
  if (!Number.isFinite(rid) || rid <= 0) return NextResponse.json({ detail: "rid 가 필요합니다." }, { status: 400 });
  const cur = await readStorePin(rid);
  const state = !cur.has_pin ? "none" : cur.is_temp ? "temp" : cur.pin ? "owner" : "unreadable";
  return NextResponse.json({ state });
}
