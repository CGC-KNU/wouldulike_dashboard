"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Spinner } from "@/app/dashboard/admin/_shared/ui";

function KakaoCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      router.replace("/login");
      return;
    }

    const login = async () => {
      try {
        const res = await fetch("/api/auth/kakao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // redirect_uri 는 백엔드 교환이 실패했을 때(localhost·프리뷰) 라우트가 직접 교환하는 데 쓴다 — 인가 요청 때 쓴 값과 같아야 한다
          // state 에 온보딩 토큰이 실려 있으면 점주로 들어가는 길이다 — 직원 계정이어도 관리자 2단계로 새지 않게 알린다
          body: JSON.stringify({ code, redirect_uri: process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI || `${window.location.origin}/auth/kakao/callback`, onboard: (searchParams.get("state") ?? "").startsWith("onboard:") }),
        });

        const data = await res.json();
        console.log("[callback] status:", res.status, "body:", JSON.stringify(data));

        // 점주 온보딩에서 온 로그인 — 카카오 `state` 에 실어 보낸 토큰으로 되돌아간다.
        // PIN 화면을 거치지 않는다: 온보딩 라우트가 임시 PIN 으로 세션을 만든다 (api/onboard/[token]/session).
        const state = searchParams.get("state") ?? "";
        if (state.startsWith("onboard:") && (data.requiresPinVerification || data.success)) {
          router.replace(`/onboard/${state.slice("onboard:".length)}?resume=1`);
          return;
        }

        if (data.requiresAdminAuth) {
          // 내부 구성원 — 2단계(공용 관리자 아이디/비번)로 넘어간다
          const name = data.staff?.display_name ?? "";
          const dept = data.staff?.department_label ?? "";
          const qs = new URLSearchParams();
          if (name) qs.set("name", name);
          if (dept) qs.set("dept", dept);
          router.replace(`/auth/admin-login${qs.toString() ? `?${qs}` : ""}`);
        } else if (data.requiresPinVerification) {
          router.replace("/auth/verify-pin");
        } else if (data.success) {
          router.replace("/dashboard");
        } else {
          const msg = encodeURIComponent(data.message || `http_${res.status}`);
          router.replace(`/login?error=${msg}`);
        }
      } catch (e) {
        console.error("[callback] fetch error:", e);
        router.replace("/login?error=server");
      }
    };

    login();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Spinner size={32} className="mx-auto mb-3 block" />
        <p className="text-sm text-gray-500">로그인 중...</p>
      </div>
    </div>
  );
}

export default function KakaoCallbackPage() {
  return (
    <Suspense>
      <KakaoCallbackInner />
    </Suspense>
  );
}
