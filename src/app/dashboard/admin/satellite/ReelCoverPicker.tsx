"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 릴스 커버 프레임 선택 — 슬라이더로 실제 영상 프레임을 미리보면서 고른다
 * (마케팅팀 피드백 2026-08-26 "표지를 따로 올리는 기능" 요청에 대한 대안 —
 * Meta 릴스 발행 API는 별도 커버 이미지 업로드를 지원하지 않고 영상 안의 프레임
 * 위치(thumb_offset)만 받는다. RD 확인 후 "프레임 선택 + 미리보기 개선"으로 진행).
 * 초 단위 숫자 입력 대신 실제 프레임이 보이는 <video> + 슬라이더로 바꿨다.
 */
export default function ReelCoverPicker({
  videoUrl,
  offsetMs,
  onChange,
  editable,
}: {
  videoUrl: string;
  offsetMs: number | null;
  onChange: (ms: number) => void;
  editable: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [localMs, setLocalMs] = useState(offsetMs ?? 0);

  useEffect(() => {
    setLocalMs(offsetMs ?? 0);
  }, [offsetMs]);

  function seekTo(ms: number) {
    setLocalMs(ms);
    if (videoRef.current) videoRef.current.currentTime = ms / 1000;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={videoUrl}
        muted
        playsInline
        preload="metadata"
        className="w-full max-h-64 rounded-lg bg-black object-contain"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          setDuration(Number.isFinite(d) ? d : 0);
          if (offsetMs) e.currentTarget.currentTime = offsetMs / 1000;
        }}
      />
      <input
        type="range"
        min={0}
        max={Math.max(duration, 0.1)}
        step={0.1}
        value={Math.min(localMs / 1000, Math.max(duration, 0.1))}
        disabled={!editable || duration === 0}
        onChange={(e) => seekTo(Number(e.target.value) * 1000)}
        onMouseUp={() => onChange(Math.round(localMs))}
        onTouchEnd={() => onChange(Math.round(localMs))}
        className="w-full accent-periwinkle disabled:opacity-40"
      />
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>0:00</span>
        <span className="font-semibold text-periwinkle">{(localMs / 1000).toFixed(1)}초</span>
        <span>{duration ? `${duration.toFixed(1)}초` : "—"}</span>
      </div>
    </div>
  );
}
