"use client";

import { useEffect } from "react";
import { takePostLoginPath } from "@/lib/postLogin";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Spinner } from "@/app/dashboard/admin/_shared/ui";

/**
 * 앱 → 웹뷰 자동 로그인 처리 페이지
 * Flutter 앱이 ?token=<jwt> 로 열면 여기서 쿠키 세팅 후 대시보드로 이동
 */
function AppLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      router.replace("/login");
      return;
    }

    const login = async () => {
      try {
        const res = await fetch("/api/auth/app-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (res.ok) {
          router.replace(takePostLoginPath());
        } else {
          router.replace("/login?error=invalid_token");
        }
      } catch {
        router.replace("/login?error=server");
      }
    };

    login();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Spinner size={32} className="mx-auto mb-3 block" />
        <p className="text-sm text-gray-500">로그인 중...</p>
      </div>
    </div>
  );
}

export default function AppLoginPage() {
  return (
    <Suspense>
      <AppLoginInner />
    </Suspense>
  );
}
