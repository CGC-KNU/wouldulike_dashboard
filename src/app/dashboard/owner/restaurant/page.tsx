"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface RestaurantInfo {
  restaurant_id: number;
  name: string;
  description: string;
  phone_number: string;
  main_menu: string;
  url: string;
  address: string;
  category: string;
}

const FIELD_META: {
  key: keyof RestaurantInfo;
  label: string;
  placeholder: string;
  multiline?: boolean;
  readOnly?: boolean;
}[] = [
  {
    key: "name",
    label: "식당명",
    placeholder: "",
    readOnly: true,
  },
  {
    key: "address",
    label: "주소",
    placeholder: "",
    readOnly: true,
  },
  {
    key: "category",
    label: "업종",
    placeholder: "",
    readOnly: true,
  },
  {
    key: "phone_number",
    label: "전화번호",
    placeholder: "02-1234-5678",
  },
  {
    key: "main_menu",
    label: "대표 메뉴",
    placeholder: "예: 돼지국밥, 수육",
  },
  {
    key: "url",
    label: "웹사이트 / 지도 링크",
    placeholder: "https://naver.me/...",
  },
  {
    key: "description",
    label: "식당 소개",
    placeholder: "손님들에게 보여줄 식당 소개를 작성해주세요.",
    multiline: true,
  },
];

export default function RestaurantEditPage() {
  const router = useRouter();
  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const rid = searchParams.get("rid");
  const ridQuery = rid ? `?rid=${rid}` : "";

  const [info, setInfo] = useState<RestaurantInfo | null>(null);
  const [draft, setDraft] = useState<Partial<RestaurantInfo>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const originalRef = useRef<RestaurantInfo | null>(null);

  useEffect(() => {
    fetch(`/api/dashboard/restaurant${ridQuery}`)
      .then((r) => r.json())
      .then((data) => {
        setInfo(data);
        originalRef.current = data;
        setDraft({
          phone_number: data.phone_number,
          main_menu: data.main_menu,
          url: data.url,
          description: data.description,
        });
      })
      .catch(() => setError("식당 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  const isDirty =
    originalRef.current &&
    (draft.phone_number !== originalRef.current.phone_number ||
      draft.main_menu !== originalRef.current.main_menu ||
      draft.url !== originalRef.current.url ||
      draft.description !== originalRef.current.description);

  const handleSave = async () => {
    if (!isDirty) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/dashboard/restaurant${ridQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: draft.phone_number,
          main_menu: draft.main_menu,
          url: draft.url,
          description: draft.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "저장에 실패했습니다.");
        return;
      }
      originalRef.current = { ...originalRef.current!, ...draft };
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-periwinkle border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-10 max-w-lg mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 19L8 12L15 5"
              stroke="#0A0676"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-navy">식당 정보 수정</h1>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-600 text-sm rounded-xl">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {FIELD_META.map(({ key, label, placeholder, multiline, readOnly }) => {
          const value = readOnly
            ? (info?.[key] ?? "")
            : (draft[key as keyof typeof draft] ?? "");

          return (
            <div key={key}>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                {label}
                {readOnly && (
                  <span className="ml-2 text-[10px] font-normal text-gray-300 normal-case tracking-normal">
                    수정 불가 (관리자 문의)
                  </span>
                )}
              </label>
              {multiline ? (
                <textarea
                  rows={4}
                  value={value as string}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [key]: e.target.value }))
                  }
                  placeholder={placeholder}
                  disabled={readOnly}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:border-periwinkle disabled:bg-gray-50 disabled:text-gray-400"
                />
              ) : (
                <input
                  type="text"
                  value={value as string}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [key]: e.target.value }))
                  }
                  placeholder={placeholder}
                  disabled={readOnly}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-periwinkle disabled:bg-gray-50 disabled:text-gray-400"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 저장 버튼 */}
      <div className="mt-8">
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className={`w-full py-3.5 rounded-2xl text-sm font-bold transition-all ${
            saved
              ? "bg-green-500 text-white"
              : isDirty
              ? "bg-periwinkle text-white hover:bg-navy"
              : "bg-gray-100 text-gray-400"
          }`}
        >
          {saved ? "✓ 저장되었습니다" : saving ? "저장 중..." : "저장"}
        </button>

        <p className="text-xs text-gray-400 text-center mt-3">
          식당명·주소·업종 변경은{" "}
          <span className="text-gray-500 font-medium">우주라이크 팀</span>에 문의해주세요.
        </p>
      </div>
    </div>
  );
}
