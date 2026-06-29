"use client";

import { useRef, useState } from "react";

/* ─── 압축 설정 타입 ─── */
export interface CompressConfig {
  maxPx: number;      // 긴 변 최대 픽셀 (0 = 원본)
  quality: number;    // JPEG 품질 0~1
}

export const COMPRESS_PRESETS: { label: string; config: CompressConfig }[] = [
  { label: "작게 (800px / 60%)", config: { maxPx: 800,  quality: 0.6 } },
  { label: "보통 (1200px / 80%)", config: { maxPx: 1200, quality: 0.8 } },
  { label: "크게 (1600px / 90%)", config: { maxPx: 1600, quality: 0.9 } },
  { label: "원본",                config: { maxPx: 0,    quality: 1.0 } },
];

const MAX_IMAGES = 5;

/* ─── Canvas 압축 ─── */
async function compressImage(file: File, cfg: CompressConfig): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (cfg.maxPx > 0 && Math.max(width, height) > cfg.maxPx) {
        const ratio = cfg.maxPx / Math.max(width, height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob 실패")),
        "image/jpeg",
        cfg.quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지 로드 실패")); };
    img.src = url;
  });
}

/* ─── Props ─── */
interface Props {
  restaurantId: number;
  initialUrls: string[];
  onSave: (urls: string[]) => Promise<void>;
}

export default function ImageUploader({ restaurantId, initialUrls, onSave }: Props) {
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [compressCfg, setCompressCfg] = useState<CompressConfig>(COMPRESS_PRESETS[1].config);
  const [showSettings, setShowSettings] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    const remaining = MAX_IMAGES - urls.length;
    if (remaining <= 0) { setError(`최대 ${MAX_IMAGES}장까지 등록할 수 있습니다.`); return; }
    const toUpload = Array.from(files).slice(0, remaining);
    setUploading(true);
    setError("");
    const newUrls: string[] = [];

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i];
      setProgress(`압축 중 (${i + 1}/${toUpload.length})...`);

      let blob: Blob;
      try {
        blob = await compressImage(file, compressCfg);
      } catch {
        setError(`${file.name} 압축 실패`);
        continue;
      }

      setProgress(`업로드 중 (${i + 1}/${toUpload.length})...`);

      // presigned URL 요청
      const presignRes = await fetch("/api/dashboard/images/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          filename: file.name,
          content_type: "image/jpeg",
        }),
      });
      if (!presignRes.ok) { setError("업로드 URL 발급 실패"); continue; }
      const { upload_url, public_url } = await presignRes.json();

      // S3 직접 PUT
      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });
      if (!putRes.ok) { setError("S3 업로드 실패"); continue; }
      newUrls.push(public_url);
    }

    setUrls((prev) => [...prev, ...newUrls]);
    setProgress("");
    setUploading(false);
  }

  function remove(idx: number) {
    setUrls((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveLeft(idx: number) {
    if (idx === 0) return;
    setUrls((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  function moveRight(idx: number) {
    setUrls((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  async function handleSave() {
    setUploading(true);
    setError("");
    try {
      await onSave(urls);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("저장에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  const isDirty = JSON.stringify(urls) !== JSON.stringify(initialUrls);

  return (
    <div>
      {/* 압축 설정 */}
      <div className="mb-3">
        <button
          onClick={() => setShowSettings((s) => !s)}
          className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
        >
          ⚙ 업로드 품질 설정 {showSettings ? "▲" : "▼"}
        </button>
        {showSettings && (
          <div className="mt-2 flex flex-col gap-1.5 bg-gray-50 rounded-xl p-3">
            {COMPRESS_PRESETS.map(({ label, config }) => (
              <label key={label} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="compress"
                  checked={compressCfg.maxPx === config.maxPx && compressCfg.quality === config.quality}
                  onChange={() => setCompressCfg(config)}
                  className="accent-periwinkle"
                />
                <span className="text-xs text-gray-600">{label}</span>
              </label>
            ))}
            <p className="text-[10px] text-gray-400 mt-1">
              현재: {compressCfg.maxPx === 0 ? "원본" : `최대 ${compressCfg.maxPx}px`} / 품질 {Math.round(compressCfg.quality * 100)}%
            </p>
          </div>
        )}
      </div>

      {/* 이미지 그리드 */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {urls.map((url, i) => (
          <div key={url} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`식당 사진 ${i + 1}`} className="w-full h-full object-cover" />
            {/* 오버레이 컨트롤 */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1.5">
              {/* 순서 이동 */}
              <div className="flex justify-between">
                <button
                  onClick={() => moveLeft(i)}
                  disabled={i === 0}
                  className="w-6 h-6 rounded-full bg-white/80 text-gray-700 text-xs disabled:opacity-30 flex items-center justify-center"
                >
                  ‹
                </button>
                <button
                  onClick={() => moveRight(i)}
                  disabled={i === urls.length - 1}
                  className="w-6 h-6 rounded-full bg-white/80 text-gray-700 text-xs disabled:opacity-30 flex items-center justify-center"
                >
                  ›
                </button>
              </div>
              {/* 삭제 */}
              <button
                onClick={() => remove(i)}
                className="self-center w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            {/* 순서 번호 */}
            <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] flex items-center justify-center">
              {i + 1}
            </span>
          </div>
        ))}

        {/* 추가 슬롯 */}
        {urls.length < MAX_IMAGES && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 hover:border-periwinkle hover:bg-gray-50 transition-colors"
          >
            <span className="text-2xl text-gray-300">+</span>
            <span className="text-[10px] text-gray-400">{urls.length}/{MAX_IMAGES}</span>
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {/* 상태 메시지 */}
      {progress && <p className="text-xs text-periwinkle mb-2">{progress}</p>}
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      {/* 저장 버튼 */}
      <button
        onClick={handleSave}
        disabled={!isDirty || uploading}
        className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
          saved
            ? "bg-green-500 text-white"
            : isDirty
            ? "bg-periwinkle text-white hover:bg-navy"
            : "bg-gray-100 text-gray-400"
        }`}
      >
        {saved ? "✓ 저장되었습니다" : uploading ? progress || "처리 중..." : "사진 저장"}
      </button>
      <p className="text-[10px] text-gray-400 text-center mt-2">
        ← › 버튼으로 순서 변경 · ✕로 삭제 · 최대 {MAX_IMAGES}장
      </p>
    </div>
  );
}
