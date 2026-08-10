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
        console.log("[callback] status:", res.status, "body:", JSON.stringify(data));

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
