import { NextRequest, NextResponse } from "next/server";
import { actorName, requireTool } from "@/lib/draft/guard";
import { backendUrl, getAccessToken, proxyBody } from "@/lib/apiProxy";
import { notifyAstro } from "@/lib/slack";
import { phoneTag, shortId, signOnboardToken, tempPinFor, type OnboardPlan } from "@/lib/onboard/token";
import { defaultFee } from "@/lib/onboard/contract";
import { remoteGet } from "@/lib/draft/remote";

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
  const b = (await req.json().catch(() => ({}))) as { rid?: number; lid?: string | null; name?: string; campus?: string; plan?: OnboardPlan; fee?: number; days?: number; phone?: string };
  if (!b.rid || !b.name || !b.campus || !b.plan) return NextResponse.json({ detail: "rid · name · campus · plan 이 필요합니다." }, { status: 400 });
  if (!["FREE", "BOOST", "PREMIUM"].includes(b.plan)) return NextResponse.json({ detail: "플랜은 FREE · BOOST · PREMIUM 중 하나입니다." }, { status: 400 });

  const by = (await actorName()) ?? "unknown";
  const tp = tempPinFor(b.rid);

  // 1) 임시 PIN — 백엔드 `ChangePinView` (dashboard/views.py) 확인 결과:
  //    · 관리자는 ?restaurant_id= 로 남의 매장 PIN 을 만든다/바꾼다.
  //    · PIN 이 **없는** 매장은 new_pin 만으로 생성. PIN 이 **있는** 매장은 관리자여도 current_pin 이 필요하다.
  //    · 현재 PIN 은 관리자가 GET /api/dashboard/restaurant/?restaurant_id= 로 읽을 수 있다 (응답 "pin").
  //    (AdminRestaurantView PATCH 는 is_affiliate·tier 만 받는다 — pin 을 보내면 400. 0921 소스 확인.)
  const admin = await getAccessToken();
  const infoRes = await fetch(backendUrl("/api/dashboard/restaurant/", `restaurant_id=${b.rid}`), { headers: { Authorization: `Bearer ${admin}` }, cache: "no-store" }).catch(() => null);
  if (!infoRes || !infoRes.ok) {
    return NextResponse.json({ detail: `매장 정보를 읽지 못했습니다 (${infoRes?.status ?? "연결 실패"}). 매장 id ${b.rid} 가 대시보드에 있는지 확인해 주세요.` }, { status: 502 });
  }
  const info = (await infoRes.json().catch(() => ({}))) as { pin?: string | null; name?: string };

  // ⚠️ 기존 PIN 이 있는 매장에는 발급하지 않는다 (0921 사고).
  // `MerchantPin.secret` 하나가 **점주 로그인 + 손님 쿠폰 사용(redeem_coupon) + 손님 스탬프 적립(add_stamp)** 셋에 다 쓰인다
  // (wouldulike_backend coupons/service.py `_verify_pin`). 임시 PIN 을 심으면 그 매장 손님의 적립이 즉시 막힌다.
  // 운영 중인 매장은 온보딩 대상이 아니다(0921 결정 4: 기존 매장 재온보딩 안 함). 신규 매장은 PIN 이 없어 그대로 통과한다.
  // 이미 우리가 심어 둔 임시 PIN 이면 "온보딩을 시작했지만 안 끝낸 매장" 이다 — 다시 발급해 준다.
  // (링크 만료·사장님 미확인은 늘 생긴다. 이 경우 손님 적립은 어차피 이미 이 값으로 돌고 있으므로 새로 망가뜨리는 게 없다.)
  const isOurTemp = Boolean(info.pin) && String(info.pin) === tp;
  // 테스트 매장(StoreOps.is_test)은 손님이 없다 — 막을 이유가 없고, 막으면 온보딩을 시험해 볼 방법이 사라진다.
  const isTest = await remoteGet<{ ops: { is_test?: boolean } | null }>(`/api/astro/stores/${b.rid}/`)
    .then((r) => Boolean(r.handled && r.ok && r.data?.ops?.is_test)).catch(() => false);
  if (info.pin && !isOurTemp && !isTest) {
    return NextResponse.json({
      detail: "이 매장에는 이미 매장 PIN 이 있어 온보딩 링크를 발급하지 않습니다. 그 PIN 은 손님 스탬프 적립·쿠폰 사용에도 쓰이므로 바꾸면 매장 운영이 멈춥니다. 이미 운영 중인 매장이면 사장님께 현재 매장 번호를 안내해 점주 대시보드로 바로 로그인하시게 해 주세요.",
      has_pin: true,
    }, { status: 409 });
  }

  // 이미 임시 PIN 이 심겨 있으면 그대로 두고 링크만 새로 뽑는다.
  if (!isOurTemp) {
    // PIN 이 이미 있으면 관리자여도 `current_pin` 을 같이 보내야 한다 (위 주석, ChangePinView).
    // 위에서 읽어 둔 현재 값을 그대로 동봉한다 — 안 보내면 400 "current_pin이 필요합니다".
    // 여기까지 온 매장은 PIN 이 없거나 테스트 매장뿐이다(위 가드).
    const pinRes = await proxyBody("POST", `/api/dashboard/auth/change-pin/?restaurant_id=${b.rid}`, info.pin ? { new_pin: tp, current_pin: String(info.pin) } : { new_pin: tp });
    if (!pinRes.ok) {
      const d = (await pinRes.json().catch(() => ({}))) as { detail?: string };
      return NextResponse.json({ detail: `임시 PIN 을 설정하지 못했습니다 (${pinRes.status}${d.detail ? ` · ${d.detail}` : ""}).` }, { status: 502 });
    }
  }

  const fee = typeof b.fee === "number" && b.fee >= 0 ? b.fee : defaultFee(b.plan, b.campus);
  // 미팅에서 받아 둔 번호가 있으면 대조표를 실어 보낸다 — 링크를 잘못 받은 사람이 계약하는 것을 막는다.
  // 번호를 모르면 그냥 뺀다. 확인할 근거가 없다고 링크를 못 내면 본말이 전도된다.
  const ph = phoneTag(b.phone ?? "");
  const { token, payload } = signOnboardToken({ rid: b.rid, lid: b.lid ?? null, name: b.name, campus: b.campus, plan: b.plan, fee, days: b.days ?? 14, ...(ph ? { ph } : {}) });
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const url = `${base}/onboard/${token}`;

  await notifyAstro(`:link: *${b.name}* 온보딩 링크 발급 · ${b.campus} · ${b.plan}${fee ? ` ${fee.toLocaleString()}원` : ""} · ${by} · #${shortId(payload)} (${b.days ?? 14}일 유효)`);

  return NextResponse.json({
    url, phone_checked: Boolean(ph), expires_at: new Date(payload.exp * 1000).toISOString(), short_id: shortId(payload),
    // 담당자가 그대로 복사해 카톡으로 보낸다(자동 발송은 하지 않는다 — 0922 결정).
    // 번호 대조가 걸려 있으면 **미리 알려야 한다.** 모르고 다른 번호를 적으면 [0]에서 막히고,
    // 사장님은 왜 막혔는지 알 길이 없다.
    kakao_text:
      `사장님, 안녕하세요. 우주라이크입니다.\n\n계약과 혜택 등록을 한 번에 마칠 수 있는 링크를 보내드립니다. 카카오 로그인 후 5분 정도면 끝납니다.\n` +
      (ph ? `휴대폰 번호는 본인 확인을 위해 **미팅 때 알려주신 번호**로 적어 주세요.\n` : "") +
      `링크는 ${b.days ?? 14}일간 유효하고, 중간에 나가셔도 이어서 하실 수 있습니다. 막히는 부분이 있으면 편하게 연락 주십시오.\n\n${url}`,
  }, { status: 201 });
}
