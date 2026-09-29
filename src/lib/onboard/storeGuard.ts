import { NextResponse } from "next/server";
import { decodeJwt } from "@/lib/jwt";

/**
 * 이 토큰이 **요청한 매장**의 것인가 (0929 사고 대응).
 *
 * 사고: 일공초밥(#328) 온보딩 링크를 연 차원영님 화면에 매장명이 '이층'(#332)으로 떴다.
 * 그 카카오 계정은 이미 이층 점주였고, 로그인 토큰에 매장 번호가 없었다. 온보딩 화면은
 * "매장 번호 없는 토큰이면 통과" 였고, 백엔드는 점주 토큰이면 `?restaurant_id=` 를 무시하고
 * **그 계정의 유일한 매장**을 돌려준다. 그대로 PIN 을 정했으면 이층 PIN 이 바뀌었다.
 *
 * 규칙: 관리자 토큰이면 통과(관리자는 원래 ?restaurant_id 로 남의 매장을 연다).
 * 그 밖에는 토큰의 restaurant_id 가 요청한 매장과 **같아야만** 통과. 번호가 없는 토큰도 막는다.
 */
export function tokenStore(access: string | undefined | null): { admin: boolean; rid: number | null } {
  if (!access) return { admin: false, rid: null };
  try {
    const j = decodeJwt<{ is_admin?: boolean; restaurant_id?: number | string | null }>(access);
    const rid = j.restaurant_id == null || j.restaurant_id === "" ? null : Number(j.restaurant_id);
    return { admin: Boolean(j.is_admin), rid: Number.isFinite(rid) ? rid : null };
  } catch { return { admin: false, rid: null }; }
}

export function tokenMatchesStore(access: string | undefined | null, rid: number | string | null | undefined): boolean {
  const t = tokenStore(access);
  if (t.admin) return true;
  if (rid == null || rid === "") return true; // 매장을 지정하지 않은 요청 — 백엔드가 토큰으로 판단한다
  return t.rid !== null && t.rid === Number(rid);
}

/** 어긋나면 409 응답, 맞으면 null. */
export function wrongStore(access: string | undefined | null, rid: number | string | null | undefined): NextResponse | null {
  if (tokenMatchesStore(access, rid)) return null;
  return NextResponse.json({
    detail: "다른 매장으로 로그인되어 있습니다. 화면을 새로고침한 뒤 카카오로 다시 시작해 주세요.",
    message: "다른 매장으로 로그인되어 있습니다. 화면을 새로고침한 뒤 카카오로 다시 시작해 주세요.",
    wrong_store: true,
  }, { status: 409 });
}
