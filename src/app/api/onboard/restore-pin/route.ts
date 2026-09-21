import { NextRequest, NextResponse } from "next/server";
import { actorName, requireTool } from "@/lib/draft/guard";
import { backendUrl, getAccessToken, proxyBody } from "@/lib/apiProxy";
import { notifyAstro } from "@/lib/slack";

/**
 * 온보딩 링크 발급을 되돌린다 — 매장 PIN 을 원래 값으로 복구 (담당자 전용).
 *
 * 왜 필요한가: 발급은 매장 PIN 을 임시값으로 갈아엎는다. 운영 중인 매장에 실수로 발급하면
 * 사장님이 쓰던 PIN 으로 로그인이 안 된다. 그때 **원래 PIN 을 알고 있으면** 여기로 되돌린다.
 * (발급 화면에 경고를 넣었지만, 이미 누른 뒤에는 되돌릴 길이 있어야 한다.)
 *
 * 현재 PIN(임시값)은 관리자가 GET restaurant/?restaurant_id= 로 읽을 수 있으므로,
 * 호출자는 복구할 PIN 만 주면 된다. 발급 토큰은 필요 없다.
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
  const info = (await infoRes.json().catch(() => ({}))) as { pin?: string | null; name?: string };

  if (String(info.pin ?? "") === String(pin)) {
    return NextResponse.json({ ok: true, already: true, name: info.name ?? null, detail: "이미 그 PIN 입니다. 바꾼 것 없습니다." });
  }

  const body: Record<string, string> = { new_pin: String(pin) };
  if (info.pin) body.current_pin = String(info.pin);
  const res = await proxyBody("POST", `/api/dashboard/auth/change-pin/?restaurant_id=${rid}`, body);
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { detail?: string };
    return NextResponse.json({ detail: `PIN 을 복구하지 못했습니다 (${res.status}${d.detail ? ` · ${d.detail}` : ""}).` }, { status: 502 });
  }

  const who = (await actorName()) ?? "unknown";
  // PIN 값은 채널에 쓰지 않는다 — 누가 어느 매장을 되돌렸는지만 남긴다.
  await notifyAstro(`:leftwards_arrow_with_hook: *${info.name ?? `매장 ${rid}`}* PIN 복구 — 온보딩 링크 발급 이전 값으로 되돌림 · ${who}`);
  return NextResponse.json({ ok: true, name: info.name ?? null });
}
