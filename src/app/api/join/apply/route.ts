import { NextRequest, NextResponse } from "next/server";
import { API, joinToken } from "@/lib/join";
import { TERMS_VERSION, startsOnAfter, termsHash, todaySeoul } from "@/lib/onboard/contract";

/**
 * 신청 제출 — 사장님 카카오 앱 토큰으로 백엔드 `/api/partner/apply/` 에 그대로 넘긴다.
 * 약관 버전 · 해시 · 개시일은 **여기서** 채운다(화면이 보낸 값을 믿지 않는다 — 동의한 약관이 무엇이었는지는 서버가 안다).
 * 관리자 대신 쓰는 길이 아니다: 이 라우트에는 팀 자격이 없다.
 */
export async function POST(req: NextRequest) {
  const t = await joinToken();
  if (!t) return NextResponse.json({ detail: "카카오로 먼저 로그인해 주세요.", login: true }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown> & { consent?: Record<string, unknown> };
  const consent = { ...(b.consent ?? {}), version: TERMS_VERSION, hash: termsHash(), starts_on: startsOnAfter(todaySeoul()) };
  const fwd = req.headers.get("x-forwarded-for");
  const r = await fetch(`${API()}/api/partner/apply/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", "User-Agent": req.headers.get("user-agent") ?? "", ...(fwd ? { "X-Forwarded-For": fwd } : {}) },
    body: JSON.stringify({ ...b, consent }),
    cache: "no-store",
  }).catch(() => null);
  if (!r) return NextResponse.json({ detail: "서버에 연결하지 못했습니다. 잠시 뒤 다시 제출해 주세요." }, { status: 503 });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) return NextResponse.json({ detail: "로그인이 만료됐습니다. 카카오로 다시 로그인해 주세요.", login: true }, { status: 401 });
  return NextResponse.json(d, { status: r.status });
}
