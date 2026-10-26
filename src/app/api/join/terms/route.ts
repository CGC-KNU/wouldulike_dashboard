import { NextResponse } from "next/server";
import { CHECKS, TERMS_VERSION, articles, boostFee, scheduleFrom, startsOnAfter, termsHash, todaySeoul } from "@/lib/onboard/contract";

/** 신청 화면이 보여 줄 약관 · 중요 내용 · 캠퍼스별 금액. 온보딩과 같은 약관(contract.ts)을 그대로 쓴다. */
export async function GET() {
  const starts_on = startsOnAfter(todaySeoul());
  const s = scheduleFrom(starts_on);
  const fees = Object.fromEntries(["경북대", "영남대", "계명대"].map((c) => [c, { FREE: 0, BOOST: boostFee(c), PREMIUM: 80000 }]));
  return NextResponse.json({
    version: TERMS_VERSION, hash: termsHash(), starts_on, schedule: s, fees,
    articles: articles(), checks: CHECKS.map((c) => ({ id: c.id, article: c.article, text: c.text(s) })),
  });
}
