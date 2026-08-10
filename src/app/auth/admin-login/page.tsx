"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

/**
 * 2단계 로그인의 2단계.
 *
 * 1단계(카카오)에서 신원이 확정된 상태로 들어온다. 여기서 입력하는 것은
 * 개인 비밀번호가 아니라 팀 공용 관리자 아이디/비번이다.
 * 직무·권한은 카카오 신원에서 나오므로 이 화면에서 고를 수 없다.
 */
function AdminLoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const staffName = params.get("name") ?? "";
  const staffDept = params.get("dept") ?? "";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsKakao, setNeedsKakao] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setLoading(true);
    setError("");
    setNeedsKakao(false);

    try {
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (data.success) {
        router.replace("/dashboard");
      } else {
        setError(data.message || "로그인에 실패했습니다.");
        setNeedsKakao(!!data.requiresKakao);
      }
    } catch {
      setError("오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-[10px] font-semibold text-periwinkle uppercase tracking-widest mb-1">
            Step 2 of 2
          </p>
          <h2 className="text-xl font-bold text-navy">관리자 인증</h2>
          <p className="mt-1 text-sm text-gray-500">팀 공용 관리자 계정으로 접속합니다</p>
        </div>

        {/* 1단계에서 확인된 신원 */}
        {staffName && (
          <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-green-700">
                {staffName}
                {staffDept && (
                  <span className="ml-1.5 font-semibold text-green-600">· {staffDept}</span>
                )}
              </p>
              <p className="text-[11px] text-green-600 mt-0.5">카카오 인증 완료</p>
            </div>
          </div>
        )}

        <form
          onSubmit={handleLogin}
          className="bg-white rounded-2xl shadow-sm p-6 flex flex-col gap-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">아이디</label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(""); }}
              placeholder="공용 관리자 아이디"
              autoComplete="username"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-periwinkle"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="공용 관리자 비밀번호"
              autoComplete="current-password"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-periwinkle"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5">
              <p className="text-xs text-red-600 leading-relaxed">{error}</p>
              {needsKakao && (
                <Link
                  href="/login"
                  className="inline-block mt-1.5 text-xs font-semibold text-red-700 underline underline-offset-2"
                >
                  카카오 로그인부터 다시 하기
                </Link>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={!username || !password || loading}
            className="w-full py-3 bg-navy text-white font-semibold rounded-xl disabled:opacity-40 hover:bg-periwinkle transition-colors mt-1"
          >
            {loading ? "확인 중..." : "로그인"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-gray-400 leading-relaxed">
          직무와 권한은 카카오 계정으로 확인됩니다.
          <br />
          <Link href="/login" className="hover:text-gray-600 underline underline-offset-2">
            다른 계정으로 로그인
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginInner />
    </Suspense>
  );
}
