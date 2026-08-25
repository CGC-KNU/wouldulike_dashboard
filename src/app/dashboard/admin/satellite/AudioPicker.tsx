"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PreviewableImg } from "@/components/ImagePreview";
import { AudioTrack } from "./types";

/**
 * 릴스 음원 선택 (설계서 §03)
 *
 * 여기 나오는 음원은 Meta 가 제3자 사용을 허가한 것들이라 저작권을 따로 해결할 필요가 없다.
 * 단 **API 목록이 인스타 앱과 다릅니다.** 담당자가 앱에서 찜해둔 음악이 없을 수 있어서
 * 그 사실을 화면에 명시한다 — 안 그러면 "왜 검색이 안 되냐"는 질문이 반복된다.
 */
export default function AudioPicker({
  audioId,
  audioVolume,
  editable,
  onSelect,
  onVolumeChange,
}: {
  audioId: string;
  audioVolume: number | null;
  editable: boolean;
  onSelect: (audioId: string, track: AudioTrack | null) => void;
  onVolumeChange: (v: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AudioTrack[]>([]);
  const [note, setNote] = useState("");
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState<AudioTrack | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    setErr("");
    try {
      const res = await fetch(`/api/satellite/audio/search?q=${encodeURIComponent(q.trim())}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.detail ?? `검색 실패 (${res.status})`);
        setResults([]);
      } else {
        setResults(d.results ?? []);
        setNote(d.note ?? "");
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

  const vol = audioVolume ?? 50;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-gray-800">음원</h3>
        <span className="text-[11px] text-gray-400">선택 사항</span>
      </div>
      <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
        라이선스가 해결된 음원만 나옵니다. 카드뉴스에는 음원을 넣을 수 없습니다.
      </p>

      {/* 선택된 음원 */}
      {audioId ? (
        <div className="rounded-xl border border-periwinkle/25 bg-periwinkle/5 px-3 py-2.5 flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg bg-periwinkle/15 text-periwinkle flex items-center justify-center shrink-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-gray-700 truncate">
              {picked?.title || "선택된 음원"}
            </p>
            <p className="text-[10px] text-gray-400 font-mono truncate">
              {picked?.artist ? `${picked.artist} · ` : ""}
              {audioId}
            </p>
          </div>
          {editable && (
            <button
              onClick={() => {
                setPicked(null);
                onSelect("", null);
              }}
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
            {open ? "닫기" : "음원 검색"}
          </button>
        )
      )}

      {/* 검색 */}
      {open && !audioId && editable && (
        <div className="mt-3 flex flex-col gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="곡명 또는 아티스트 (2자 이상)"
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
              {results.map((t) => (
                <button
                  key={t.audio_id}
                  onClick={() => {
                    setPicked(t);
                    onSelect(t.audio_id, t);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 text-left transition-colors"
                >
                  {t.thumbnail_url ? (
                    <PreviewableImg src={t.thumbnail_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                  ) : (
                    <span className="w-8 h-8 rounded bg-gray-100 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-gray-700 truncate">{t.title}</span>
                    <span className="block text-[10px] text-gray-400 truncate">
                      {t.artist}
                      {t.duration_ms ? ` · ${Math.round(t.duration_ms / 1000)}초` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {!searching && query.trim().length >= 2 && results.length === 0 && !err && (
            <p className="text-[11px] text-gray-400 text-center py-2 leading-relaxed">
              결과가 없습니다.
              <br />
              인스타 앱에서 본 음악이 API 목록에는 없을 수 있습니다.
            </p>
          )}

          {note && <p className="text-[10px] text-gray-400 leading-relaxed mt-1">{note}</p>}
        </div>
      )}

      {/* 볼륨 밸런스 */}
      {audioId && (
        <div className="mt-3 pt-3 border-t border-gray-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-gray-600">음원 / 원본 소리 밸런스</span>
            <span className="text-[11px] text-gray-400 font-mono">
              음원 {vol} · 원본 {100 - vol}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={vol}
            disabled={!editable}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="w-full accent-periwinkle disabled:opacity-50"
          />
          <div className="flex justify-between text-[10px] text-gray-300 mt-0.5">
            <span>원본만</span>
            <span>반반</span>
            <span>음원만</span>
          </div>
          {audioVolume === null && (
            <p className="text-[10px] text-gray-400 mt-1.5">
              지정하지 않으면 인스타 기본값이 적용됩니다.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
