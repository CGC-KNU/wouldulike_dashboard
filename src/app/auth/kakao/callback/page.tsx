"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

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
          body: JSON.stringify({ code }),
        });

        const data = await res.json();

        if (data.requiresPinVerification) {
          // 처음 가입 → PIN 인증 페이지로
          router.replace("/auth/verify-pin");
        } else if (data.success) {
          // 기존 점주 계정 → 대시보드로
          router.replace("/dashboard");
        } else {
          router.replace("/login?error=not_owner");
        }
      } catch {
        router.replace("/login?error=server");
      }
    };

    login();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-periwinkle border-t-transparent rounded-full animate-spin mx-auto mb-3" />
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
