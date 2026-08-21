"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { LocationResult } from "./types";

/**
 * 위치 태그 (Meta 공식 media 파라미터 `location_id`)
 *
 * 인스타그램 전용 장소 검색 API는 없어서, Facebook Pages Search(type=place)로 얻은
 * 페이지 ID를 그대로 location_id 로 쓴다. 캐러셀 낱장에는 못 붙지만, 카드뉴스 전체·
 * 릴스·기타 컨테이너에는 전부 지원된다 (Meta 공식 문서 기준).
 */
export default function LocationPicker({
  locationId,
  locationName,
  editable,
  onSelect,
}: {
  locationId: string;
  locationName: string;
  editable: boolean;
  onSelect: (locationId: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    setErr("");
    try {
      const res = await fetch(`/api/satellite/location/search?q=${encodeURIComponent(q.trim())}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.detail ?? `검색 실패 (${res.status})`);
        setResults([]);
      } else {
        setResults(d.results ?? []);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(query), 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, search]);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-gray-800">위치</h3>
        <span className="text-[11px] text-gray-400">선택 사항</span>
      </div>
      <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
        카드뉴스는 게시물 전체에 하나만 붙습니다 (낱장별 위치는 지원되지 않습니다).
      </p>

      {locationId ? (
        <div className="rounded-xl border border-periwinkle/25 bg-periwinkle/5 px-3 py-2.5 flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg bg-periwinkle/15 text-periwinkle flex items-center justify-center shrink-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 21s-7-6.1-7-11a7 7 0 0114 0c0 4.9-7 11-7 11z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-gray-700 truncate">{locationName || "선택된 위치"}</p>
            <p className="text-[10px] text-gray-400 font-mono truncate">{locationId}</p>
          </div>
          {editable && (
            <button
              onClick={() => onSelect("", "")}
              className="text-[10px] text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg border border-gray-200 shrink-0"
            >
              해제
            </button>
          )}
        </div>
      ) : (
        editable && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-full py-2.5 text-xs font-semibold text-periwinkle border border-dashed border-periwinkle/30 rounded-xl hover:bg-periwinkle/5 transition-colors"
          >
            {open ? "닫기" : "위치 검색"}
          </button>
        )
      )}

      {open && !locationId && editable && (
        <div className="mt-3 flex flex-col gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="장소명 (2자 이상, 예: 성수동)"
            className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-periwinkle"
          />

          {err && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-[11px] text-red-600 leading-relaxed">{err}</p>
            </div>
          )}

          {searching && <p className="text-[11px] text-gray-300 text-center py-2">검색 중...</p>}

          {!searching && results.length > 0 && (
            <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r.location_id}
                  onClick={() => {
                    onSelect(r.location_id, r.name);
                    setOpen(false);
                  }}
                  className="flex flex-col items-start px-2.5 py-2 rounded-lg hover:bg-gray-50 text-left transition-colors"
                >
                  <span className="text-xs font-medium text-gray-700 truncate w-full">{r.name}</span>
                  {r.address && (
                    <span className="text-[10px] text-gray-400 truncate w-full">{r.address}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {!searching && query.trim().length >= 2 && results.length === 0 && !err && (
            <p className="text-[11px] text-gray-400 text-center py-2 leading-relaxed">
              결과가 없습니다. 다른 이름으로 검색해보세요.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
