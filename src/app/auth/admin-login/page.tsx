"use client";

import { Suspense, useEffect, useState } from "react";
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
  // null = 아직 확인 중
  const [kakaoReady, setKakaoReady] = useState<boolean | null>(null);

  /**
   * 1단계를 건너뛰고 이 URL 로 바로 들어온 경우를 걸러낸다.
   * (북마크·직접 입력이 흔한 경로다. 예전에는 여기서 아이디/비번을 다 넣고 나서야
   *  "카카오 로그인을 먼저 하세요" 401 을 받아 헛수고했다)
   */
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/pending-kakao")
      .then((r) => (r.ok ? r.json() : { ready: false }))
      .then((d) => {
        if (alive) setKakaoReady(!!d.ready);
      })
      .catch(() => {
        // 확인 실패 시엔 막지 않는다 — 로그인 자체를 못 하게 되는 게 더 나쁘다
        if (alive) setKakaoReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

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

  // 1단계 미통과 — 입력창을 보여주지 않고 되돌려보낸다
  if (kakaoReady === false) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <div className="w-full max-w-sm text-center">
          <div className="bg-white rounded-2xl shadow-sm p-8 flex flex-col gap-4">
            <span className="w-11 h-11 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <h2 className="text-base font-bold text-navy">카카오 로그인이 먼저입니다</h2>
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                관리자 인증은 2단계입니다.
                <br />
                카카오로 본인 확인을 먼저 해주세요.
              </p>
            </div>
            <Link
              href="/login"
              className="w-full py-3 bg-navy text-white font-semibold rounded-xl hover:bg-periwinkle transition-colors"
            >
              카카오 로그인으로 이동
            </Link>
          </div>
          <p className="mt-4 text-[11px] text-gray-400 leading-relaxed">
            이 페이지를 북마크해두셨다면 <span className="font-mono">/login</span> 으로 바꿔주세요.
          </p>
        </div>
      </main>
    );
  }

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
              {needsKakao ? (
                <Link
                  href="/login"
                  className="inline-block mt-1.5 text-xs font-semibold text-red-700 underline underline-offset-2"
                >
                  카카오 로그인부터 다시 하기
                </Link>
              ) : (
                // 신원은 확인됐는데 공용 비번이 틀린 경우 — 개인 비번과 혼동하기 쉽다
                <p className="text-[11px] text-red-500 mt-1.5 leading-relaxed">
                  개인 비밀번호가 아니라 <span className="font-semibold">팀 공용 관리자 계정</span>입니다.
                  값이 기억나지 않으면 슈퍼관리자에게 확인하세요.
                </p>
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
