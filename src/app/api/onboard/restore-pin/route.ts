import { NextRequest, NextResponse } from "next/server";
import { actorName, requireTool } from "@/lib/draft/guard";
import { tempPinFor } from "@/lib/onboard/token";
import { backendUrl, getAccessToken, proxyBody } from "@/lib/apiProxy";
import { notifyAstro } from "@/lib/slack";

/**
 * 온보딩 링크 발급을 되돌린다 — 매장 PIN 을 원래 값으로 복구 (담당자 전용).
 *
 * 왜 필요한가: 발급은 매장 PIN 을 임시값으로 갈아엎는다. 운영 중인 매장에 실수로 발급하면
 * 사장님이 쓰던 PIN 으로 로그인이 안 된다. 그때 **원래 PIN 을 알고 있으면** 여기로 되돌린다.
 * (발급 화면에 경고를 넣었지만, 이미 누른 뒤에는 되돌릴 길이 있어야 한다.)
 *
 * 0925 부터 현재 PIN 은 읽을 수 없다(해시 저장). 호출자가 복구할 PIN 을 준다 — 그 값은
 * 담당자가 알고 있어야 한다. 모르면 복구가 아니라 **새로 정해 드리는 것**이 맞다.
 *
 * POST { rid, pin }
 */
export async function POST(req: NextRequest) {
  const deny = await requireTool("restaurants");
  if (deny) return deny;
  const { rid, pin } = (await req.json().catch(() => ({}))) as { rid?: number; pin?: string };
  if (!rid || !/^\d{4,}$/.test(String(pin ?? ""))) {
    return NextResponse.json({ detail: "rid 와 복구할 PIN(숫자 4자리 이상)이 필요합니다." }, { status: 400 });
  }

  const admin = await getAccessToken();
  const infoRes = await fetch(backendUrl("/api/dashboard/restaurant/", `restaurant_id=${rid}`), { headers: { Authorization: `Bearer ${admin}` }, cache: "no-store" }).catch(() => null);
  if (!infoRes || !infoRes.ok) return NextResponse.json({ detail: `매장 정보를 읽지 못했습니다 (${infoRes?.status ?? "연결 실패"}).` }, { status: 502 });
  const info = (await infoRes.json().catch(() => ({}))) as { has_pin?: boolean; name?: string };

  const ask = (candidate: string) =>
    fetch(backendUrl("/api/dashboard/auth/check-pin/", `restaurant_id=${rid}`), {
      method: "POST", headers: { Authorization: `Bearer ${admin}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pin: candidate }), cache: "no-store",
    }).then(async (r) => (r.ok ? Boolean(((await r.json()) as { matches?: boolean }).matches) : false)).catch(() => false);

  if (info.has_pin) {
    // 이미 그 값이면 헛일이다.
    if (await ask(String(pin))) {
      return NextResponse.json({ ok: true, already: true, name: info.name ?? null, detail: "이미 그 PIN 입니다. 바꾼 것 없습니다." });
    }

    /**
     * **운영 중인 매장에는 되돌리지 않는다** (0925 전수 점검).
     *
     * 발급(`issue`)에는 이 가드가 있는데 여기에는 없었다. 그래서 rid 를 잘못 치면 엉뚱한
     * 매장의 PIN 이 조용히 바뀌고, 그 번호는 **손님 스탬프 적립과 쿠폰 사용에도 쓰이므로**
     * 그 가게 운영이 그 자리에서 멈춘다. 게다가 이제 PIN 은 되읽을 수 없어 되돌릴 수도 없다.
     *
     * 되돌리기는 "우리가 임시 PIN 을 심어 놓은 매장" 을 원래대로 하는 일이다.
     * 지금 걸린 게 우리 임시 PIN 이 아니면, 그건 되돌릴 대상이 아니라 남의 가게다.
     */
    if (!(await ask(tempPinFor(rid)))) {
      return NextResponse.json({
        detail: "이 매장에는 우리가 심은 임시 PIN 이 걸려 있지 않습니다. 되돌릴 대상이 아닙니다 — 매장 id 를 다시 확인해 주세요. " +
          "그 번호는 손님 스탬프 적립·쿠폰 사용에도 쓰이므로 여기서 바꾸면 그 가게 운영이 멈춥니다.",
        not_our_temp: true,
      }, { status: 409 });
    }
  }

  // 관리자는 current_pin 없이 바꾼다 (0925).
  const res = await proxyBody("POST", `/api/dashboard/auth/change-pin/?restaurant_id=${rid}`, { new_pin: String(pin) });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { detail?: string };
    return NextResponse.json({ detail: `PIN 을 복구하지 못했습니다 (${res.status}${d.detail ? ` · ${d.detail}` : ""}).` }, { status: 502 });
  }

  const who = (await actorName()) ?? "unknown";
  // PIN 값은 채널에 쓰지 않는다 — 누가 어느 매장을 되돌렸는지만 남긴다.
  await notifyAstro(`:leftwards_arrow_with_hook: *${info.name ?? `매장 ${rid}`}* PIN 복구 — 온보딩 링크 발급 이전 값으로 되돌림 · ${who}`);
  return NextResponse.json({ ok: true, name: info.name ?? null });
}
