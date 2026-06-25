"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Restaurant {
  restaurant_id: number;
  name: string;
}

export default function VerifyPinPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Restaurant[]>([]);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [searching, setSearching] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 검색어 변경 시 debounce 300ms 후 API 호출
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const cookieRes = await fetch("/api/auth/restaurants?" + new URLSearchParams({ search: query.trim() }));
        const data = await cookieRes.json();
        setSuggestions((data.restaurants ?? []).slice(0, 10));
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleSelect = (r: Restaurant) => {
    setSelected(r);
    setQuery("");
    setSuggestions([]);
    setPin("");
    setError("");
  };

  const handleVerify = async () => {
    if (!selected || pin.length !== 4) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: selected.restaurant_id, pin }),
      });
      const data = await res.json();
      if (data.success) {
        router.replace("/dashboard");
      } else {
        setError(data.message || "PIN이 올바르지 않습니다.");
        setPin("");
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
          <h2 className="text-xl font-bold text-navy">점주 인증</h2>
          <p className="mt-1 text-sm text-gray-500">
            매장을 선택하고 4자리 PIN을 입력하세요
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 flex flex-col gap-5">
          {/* 매장 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              매장 선택
            </label>

            {selected ? (
              <div className="flex items-center justify-between px-4 py-3 bg-periwinkle/10 rounded-xl border border-periwinkle">
                <span className="font-medium text-navy">{selected.name}</span>
                <button
                  onClick={() => {
                    setSelected(null);
                    setPin("");
                    setError("");
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  변경
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="매장명 검색..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-periwinkle"
                  autoComplete="off"
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {suggestions.length > 0 && (
                  <ul className="absolute top-full mt-1 w-full bg-white border border-gray-100 rounded-xl shadow-md z-10 max-h-52 overflow-y-auto">
                    {suggestions.map((r) => (
                      <li key={r.restaurant_id}>
                        <button
                          onClick={() => handleSelect(r)}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                        >
                          {r.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!searching && query.length >= 1 && suggestions.length === 0 && (
                  <p className="mt-1.5 text-xs text-gray-400">검색 결과가 없습니다.</p>
                )}
              </div>
            )}
          </div>

          {/* PIN 입력 */}
          {selected && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                4자리 PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, ""));
                  setError("");
                }}
                placeholder="• • • •"
                autoFocus
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center text-xl tracking-widest focus:outline-none focus:border-periwinkle"
              />
              {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={!selected || pin.length !== 4 || loading}
            className="w-full py-3 bg-periwinkle text-white font-semibold rounded-xl disabled:opacity-40 hover:bg-navy transition-colors"
          >
            {loading ? "확인 중..." : "인증하기"}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          PIN 번호를 모르면 우주라이크 팀에 문의해주세요.
        </p>
      </div>
    </main>
  );
}
