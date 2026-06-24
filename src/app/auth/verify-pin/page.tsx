"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VerifyPinPage() {
  const router = useRouter();
  const [restaurantQuery, setRestaurantQuery] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [restaurants, setRestaurants] = useState<{ id: number; name: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const searchRestaurants = async (query: string) => {
    if (query.length < 1) {
      setRestaurants([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/affiliate-restaurants/?search=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      setRestaurants(data.results?.slice(0, 10) || []);
    } catch {
      setRestaurants([]);
    } finally {
      setSearching(false);
    }
  };

  const handleVerify = async () => {
    if (!selectedRestaurant || pin.length !== 4) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/verify-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: selectedRestaurant.id, pin }),
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
          {/* 식당 검색 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              매장 선택
            </label>
            {selectedRestaurant ? (
              <div className="flex items-center justify-between px-4 py-3 bg-periwinkle/10 rounded-xl border border-periwinkle">
                <span className="font-medium text-navy">
                  {selectedRestaurant.name}
                </span>
                <button
                  onClick={() => {
                    setSelectedRestaurant(null);
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
                  value={restaurantQuery}
                  onChange={(e) => {
                    setRestaurantQuery(e.target.value);
                    searchRestaurants(e.target.value);
                  }}
                  placeholder="매장명 검색..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-periwinkle"
                />
                {restaurants.length > 0 && (
                  <div className="absolute top-full mt-1 w-full bg-white border border-gray-100 rounded-xl shadow-md z-10 max-h-48 overflow-y-auto">
                    {restaurants.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => {
                          setSelectedRestaurant(r);
                          setRestaurantQuery("");
                          setRestaurants([]);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PIN 입력 */}
          {selectedRestaurant && (
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
                  const v = e.target.value.replace(/\D/g, "");
                  setPin(v);
                  setError("");
                }}
                placeholder="• • • •"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center text-xl tracking-widest focus:outline-none focus:border-periwinkle"
              />
              {error && (
                <p className="mt-1.5 text-xs text-red-500">{error}</p>
              )}
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={!selectedRestaurant || pin.length !== 4 || loading}
            className="w-full py-3 bg-periwinkle text-white font-semibold rounded-xl disabled:opacity-40 hover:bg-navy transition-colors"
          >
            {loading ? "확인 중..." : "인증하기"}
          </button>
        </div>
      </div>
    </main>
  );
}
