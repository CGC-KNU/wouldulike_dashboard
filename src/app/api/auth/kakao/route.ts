import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { code, redirect_uri } = (await req.json()) as { code?: string; redirect_uri?: string };

  if (!code) {
    return NextResponse.json({ success: false, message: "code missing" }, { status: 400 });
  }

  // 코드 교환은 **여기서 먼저** 한다.
  // 백엔드도 code 를 받지만 교환에 자기 환경변수의 redirect_uri(운영 주소)를 쓴다 (accounts/views.py:297).
  // localhost·프리뷰에서 받은 코드는 그 교환이 거절되고, **카카오는 실패한 교환에도 코드를 소모한다** —
  // 백엔드에 먼저 보냈다가 실패하면 우리가 다시 교환할 코드가 없다 (0921 실측, KOE320).
  // 그래서 인가 요청 때 쓴 redirect_uri 로 여기서 교환하고, 백엔드에는 access_token 을 넘긴다 (같은 뷰 291행이 받는다).
  // 교환이 안 되면(예: client_secret 요구) 예전처럼 code 를 그대로 넘긴다.
  let payload: Record<string, string> = { code };
  if (redirect_uri && process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID) {
    const form = new URLSearchParams({ grant_type: "authorization_code", client_id: process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID, redirect_uri, code });
    if (process.env.KAKAO_CLIENT_SECRET) form.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
    try {
      const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, body: form, cache: "no-store" });
      const tok = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string; error_code?: string };
      if (tokenRes.ok && tok.access_token) payload = { access_token: tok.access_token };
      else console.error("[kakao/route] self exchange failed → code 로 폴백:", tok.error_code ?? tok.error ?? tokenRes.status, "(redirect_uri:", redirect_uri, ")");
    } catch (e) {
      console.error("[kakao/route] self exchange error → code 로 폴백:", e);
    }
  }

  const backendRes = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/auth/kakao`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!backendRes.ok) {
    const errBody = await backendRes.text();
    console.error("[kakao/route] backend login failed:", errBody);
    return NextResponse.json(
      { success: false, message: "카카오 로그인 실패" },
      { status: 401 }
    );
  }

  const body = await backendRes.json();
  const access: string = body.token?.access ?? body.access;
  const refresh: string = body.token?.refresh ?? body.refresh;
  const is_owner: boolean = body.is_owner ?? false;
  const is_staff_account: boolean = body.is_staff_account ?? false;
  const kakaoId: number | undefined = body.user?.kakao_id;

  const cookieStore = await cookies();

  // 내부 구성원(대시보드 명단)이면 2단계 — 공용 관리자 아이디/비번으로 넘긴다.
  // 여기서는 아직 access_token 을 심지 않는다. 관문을 통과해야 세션이 생긴다.
  if (is_staff_account && kakaoId != null) {
    cookieStore.set("pending_kakao_id", String(kakaoId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 15,
    });
    return NextResponse.json({
      success: false,
      requiresAdminAuth: true,
      staff: body.staff ?? null,
    });
  }

  if (is_owner) {
    cookieStore.set("access_token", access, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    cookieStore.set("refresh_token", refresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 90,
    });
    return NextResponse.json({ success: true });
  }

  // 신규 / 미인증 → pending_token 세팅 후 PIN 인증 유도
  cookieStore.set("pending_token", access, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 30,
  });

  return NextResponse.json({ success: false, requiresPinVerification: true });
}
