import { NextRequest, NextResponse } from "next/server";
import { actorName, requireTool } from "@/lib/draft/guard";
import { proxyBody } from "@/lib/apiProxy";
import { notifyAstro } from "@/lib/slack";
import { newTempPin, shortId, signOnboardToken, type OnboardPlan } from "@/lib/onboard/token";
import { defaultFee } from "@/lib/onboard/contract";

/**
 * 온보딩 링크 발급 (담당자 전용).
 *
 * POST { rid, lid?, name, campus, plan, fee?, days? }
 *  1. 매장에 임시 PIN 을 심는다 (`/api/dashboard/admin/restaurants/{rid}/` PATCH pin)
 *     — 점주는 이 PIN 을 모른다. 세션 교환에만 쓰이고 [0]단계에서 점주가 갈아엎는다.
 *  2. 토큰을 서명해 링크를 돌려준다. 저장소 없음 (lib/onboard/token.ts 머리말).
 *  3. #sat-astro 에 "링크 발급" 한 줄. 토큰 본문은 채널에 쓰지 않는다.
 */
export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const b = (await req.json().catch(() => ({}))) as { rid?: number; lid?: string | null; name?: string; campus?: string; plan?: OnboardPlan; fee?: number; days?: number };
  if (!b.rid || !b.name || !b.campus || !b.plan) return NextResponse.json({ detail: "rid · name · campus · plan 이 필요합니다." }, { status: 400 });
  if (!["FREE", "BOOST", "PREMIUM"].includes(b.plan)) return NextResponse.json({ detail: "플랜은 FREE · BOOST · PREMIUM 중 하나입니다." }, { status: 400 });

  const by = (await actorName()) ?? "unknown";
  const tp = newTempPin();

  // 1) 임시 PIN — 백엔드가 pin 필드를 안 받으면 여기서 멈춘다. 링크만 나가고 로그인이 안 되는 상황을 만들지 않는다.
  const pinRes = await proxyBody("PATCH", `/api/dashboard/admin/restaurants/${b.rid}/`, { pin: tp });
  if (!pinRes.ok) {
    const d = (await pinRes.json().catch(() => ({}))) as { detail?: string };
    return NextResponse.json({ detail: `임시 PIN 을 설정하지 못했습니다 (${pinRes.status}${d.detail ? ` · ${d.detail}` : ""}). 백엔드 매장 수정 API 가 pin 을 받는지 확인이 필요합니다.` }, { status: 502 });
  }

  const fee = typeof b.fee === "number" && b.fee >= 0 ? b.fee : defaultFee(b.plan, b.campus);
  const { token, payload } = signOnboardToken({ rid: b.rid, lid: b.lid ?? null, name: b.name, campus: b.campus, plan: b.plan, fee, by, tp, days: b.days ?? 14 });
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const url = `${base}/onboard/${token}`;

  await notifyAstro(`:link: *${b.name}* 온보딩 링크 발급 · ${b.campus} · ${b.plan}${fee ? ` ${fee.toLocaleString()}원` : ""} · ${by} · #${shortId(payload)} (${b.days ?? 14}일 유효)`);

  return NextResponse.json({
    url, expires_at: new Date(payload.exp * 1000).toISOString(), short_id: shortId(payload),
    kakao_text:
      `사장님, 안녕하세요. 우주라이크입니다.\n\n계약과 혜택 등록을 한 번에 마칠 수 있는 링크를 보내드립니다. 카카오 로그인 후 5분 정도면 끝납니다.\n\n${url}\n\n링크는 ${b.days ?? 14}일간 유효하고, 중간에 나가셔도 이어서 하실 수 있습니다. 막히는 부분이 있으면 편하게 연락 주십시오.`,
  }, { status: 201 });
}
